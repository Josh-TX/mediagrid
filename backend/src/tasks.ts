import { FileSystem } from "@effect/platform"
import { Effect, Fiber, Option } from "effect"
import * as path from "node:path"
import { Database } from "./db"
import { walk, probeAndInsert } from "./scan"
import { checkAndDeleteIfMissing } from "./clean"
import { runGenThumbnails, type GenThumbnailsParams } from "./gen-thumbnails"
import { runGenHighlights, type GenHighlightsParams } from "./gen-highlights"

const MEDIA_DIR = process.env["MEDIA_DIR"] ?? "/media"

type TaskType = "scan" | "clean" | "gen-thumbnails" | "gen-highlights"

// ---- Internal types ----

interface ActiveTaskRecord {
  id: number
  type: TaskType
  status: string
  startedAt: number
  cancelling: boolean
  fiber: Fiber.RuntimeFiber<void, never> | null
}

interface QueuedTaskRecord {
  id: number
  type: TaskType
  enqueuedAt: number
  params?: GenThumbnailsParams | GenHighlightsParams
}

interface RecentTaskRecord {
  id: number
  type: TaskType
  outcome: "completed" | "cancelled" | "failed"
  message: string
  finishedAt: number
  duration: number
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / 1024).toFixed(1)}KB`
}

// ---- Module-level state ----

let nextId = 1
let activeTask: ActiveTaskRecord | null = null
let taskQueue: QueuedTaskRecord[] = []
let recentTasks: RecentTaskRecord[] = []

// ---- Internal helpers ----

function updateStatus(taskId: number, status: string): void {
  if (activeTask?.id === taskId) {
    activeTask = { ...activeTask, status }
  }
}

function finishActive(outcome: Omit<RecentTaskRecord, "duration">, startedAt: number): void {
  if (activeTask?.id === outcome.id) {
    activeTask = null
  }
  recentTasks = [{ ...outcome, duration: outcome.finishedAt - startedAt }, ...recentTasks].slice(0, 20)
}

// ---- Public API ----

export function getTasksState() {
  return {
    active: activeTask
      ? {
          id: activeTask.id,
          type: activeTask.type,
          status: activeTask.status,
          startedAt: activeTask.startedAt,
          cancelling: activeTask.cancelling,
        }
      : null,
    queue: taskQueue.map((t) => ({ id: t.id, type: t.type, enqueuedAt: t.enqueuedAt })),
    recent: recentTasks.map((t) => ({
      id: t.id,
      type: t.type,
      outcome: t.outcome,
      message: t.message,
      finishedAt: t.finishedAt,
      duration: t.duration,
    })),
  }
}

export function enqueueScan(): Effect.Effect<{ id: number } | null, never, Database | FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const alreadyExists =
      activeTask?.type === "scan" || taskQueue.some((t) => t.type === "scan")
    if (alreadyExists) return null

    const id = nextId++
    taskQueue.push({ id, type: "scan", enqueuedAt: Date.now() })
    yield* tryStartNext()
    return { id }
  })
}

export function enqueueClean(): Effect.Effect<{ id: number } | null, never, Database | FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const alreadyExists =
      activeTask?.type === "clean" || taskQueue.some((t) => t.type === "clean")
    if (alreadyExists) return null

    const id = nextId++
    taskQueue.push({ id, type: "clean", enqueuedAt: Date.now() })
    yield* tryStartNext()
    return { id }
  })
}

export function enqueueGenThumbnails(
  params: GenThumbnailsParams,
): Effect.Effect<{ id: number }, never, Database | FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const id = nextId++
    taskQueue.push({ id, type: "gen-thumbnails", enqueuedAt: Date.now(), params })
    yield* tryStartNext()
    return { id }
  })
}

export function enqueueGenHighlights(
  params: GenHighlightsParams,
): Effect.Effect<{ id: number }, never, Database | FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const id = nextId++
    taskQueue.push({ id, type: "gen-highlights", enqueuedAt: Date.now(), params })
    yield* tryStartNext()
    return { id }
  })
}

export function cancelTaskById(id: number): Effect.Effect<boolean, never, never> {
  return Effect.gen(function* () {
    // Cancel active task
    if (activeTask?.id === id) {
      const fiber = activeTask.fiber
      activeTask = { ...activeTask, cancelling: true }
      if (fiber) {
        // Fire-and-forget interrupt; onInterrupt in the task effect records the outcome
        yield* Effect.forkDaemon(Fiber.interrupt(fiber).pipe(Effect.asVoid))
      }
      return true
    }

    // Cancel queued task
    const idx = taskQueue.findIndex((t) => t.id === id)
    if (idx !== -1) {
      const queued = taskQueue.splice(idx, 1)[0]!
      const now = Date.now()
      finishActive({ id: queued.id, type: queued.type, outcome: "cancelled", message: "cancelled before starting", finishedAt: now }, now)
      return true
    }

    return false
  })
}

// ---- Task runner ----

function tryStartNext(): Effect.Effect<void, never, Database | FileSystem.FileSystem> {
  return Effect.gen(function* () {
    if (activeTask !== null || taskQueue.length === 0) return

    const next = taskQueue.shift()!
    activeTask = {
      id: next.id,
      type: next.type,
      status: "starting...",
      startedAt: Date.now(),
      cancelling: false,
      fiber: null,
    }

    let taskEffect: Effect.Effect<void, never, Database | FileSystem.FileSystem>
    if (next.type === "scan") {
      taskEffect = buildScanEffect(next.id)
    } else if (next.type === "clean") {
      taskEffect = buildCleanEffect(next.id)
    } else if (next.type === "gen-thumbnails") {
      taskEffect = buildGenThumbnailsEffect(next.id, next.params as GenThumbnailsParams)
    } else {
      taskEffect = buildGenHighlightsEffect(next.id, next.params as GenHighlightsParams)
    }

    const wrapped = taskEffect.pipe(Effect.ensuring(tryStartNext()))

    const fiber = yield* Effect.forkDaemon(wrapped)
    if (activeTask?.id === next.id) {
      activeTask = { ...activeTask, fiber }
    }
  })
}

// ---- Scan task ----

function buildScanEffect(taskId: number): Effect.Effect<void, never, Database | FileSystem.FileSystem> {
  const state = { processed: 0, inserted: 0, total: 0 }
  const startedAt = activeTask?.startedAt ?? Date.now()

  return Effect.gen(function* () {
    const db = yield* Database
    const fs = yield* FileSystem.FileSystem

    const existing = yield* db.getAllMedia()
    const existingFilesizes = new Map(existing.map((m) => [m.path, m.filesize]))

    // Phase 1: stat every file and filter to those whose filesize changed or are new
    const allFiles = yield* walk(MEDIA_DIR)
    type PendingFile = { abs: string; rel: string; filesize: number; mdate: number }
    const toProbe: PendingFile[] = []
    for (const abs of allFiles) {
      const info = yield* fs.stat(abs).pipe(Effect.orDie)
      const rel = '/' + path.relative(MEDIA_DIR, abs)
      const filesize = Number(info.size)
      if (existingFilesizes.get(rel) === filesize) continue
      const mdate = Option.match(info.mtime, {
        onNone: () => 0,
        onSome: (d) => Math.floor(d.getTime()),
      })
      toProbe.push({ abs, rel, filesize, mdate })
    }

    state.total = toProbe.length
    updateStatus(taskId, `0/${state.total}`)

    // Phase 2: probe and upsert only the changed/new files
    for (const { abs, rel, filesize, mdate } of toProbe) {
      const wasInserted = yield* probeAndInsert(abs, rel, filesize, mdate)
      if (wasInserted) state.inserted++
      state.processed++
      updateStatus(taskId, `${state.processed}/${state.total}`)
    }

    finishActive({ id: taskId, type: "scan", outcome: "completed", message: `added ${state.inserted} files`, finishedAt: Date.now() }, startedAt)
  }).pipe(
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        finishActive({ id: taskId, type: "scan", outcome: "cancelled", message: `cancelled after ${state.processed} files`, finishedAt: Date.now() }, startedAt)
      }),
    ),
    Effect.catchAllDefect(() =>
      Effect.sync(() => {
        finishActive({ id: taskId, type: "scan", outcome: "failed", message: `failed after ${state.processed} files`, finishedAt: Date.now() }, startedAt)
      }),
    ),
  )
}

// ---- Clean task ----

function buildCleanEffect(taskId: number): Effect.Effect<void, never, Database | FileSystem.FileSystem> {
  const state = { processed: 0, purged: 0 }
  const startedAt = activeTask?.startedAt ?? Date.now()

  return Effect.gen(function* () {
    const db = yield* Database
    const allMedia = yield* db.getAllMedia()

    for (const record of allMedia) {
      const deleted = yield* checkAndDeleteIfMissing(record, MEDIA_DIR)
      if (deleted) state.purged++
      state.processed++
      updateStatus(taskId, `${state.purged} purged`)
    }

    finishActive({ id: taskId, type: "clean", outcome: "completed", message: `removed ${state.purged} files`, finishedAt: Date.now() }, startedAt)
  }).pipe(
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        finishActive({ id: taskId, type: "clean", outcome: "cancelled", message: `cancelled after ${state.purged} purged`, finishedAt: Date.now() }, startedAt)
      }),
    ),
    Effect.catchAllDefect(() =>
      Effect.sync(() => {
        finishActive({ id: taskId, type: "clean", outcome: "failed", message: `failed after ${state.purged} purged`, finishedAt: Date.now() }, startedAt)
      }),
    ),
  )
}

// ---- Gen-Thumbnails task ----

function buildGenThumbnailsEffect(
  taskId: number,
  params: GenThumbnailsParams,
): Effect.Effect<void, never, Database | FileSystem.FileSystem> {
  let processed = 0
  const startedAt = activeTask?.startedAt ?? Date.now()
  const onStatus = (status: string) => {
    updateStatus(taskId, status)
    const m = status.match(/^(\d+)/)
    if (m) processed = Number(m[1])
  }

  return runGenThumbnails(params, onStatus).pipe(
    Effect.tap(({ count, avgSize }) =>
      Effect.sync(() => {
        const msg = count === 0 ? "nothing generated" : `${count} thumbnails generated, avg ${humanSize(avgSize)}`
        finishActive({ id: taskId, type: "gen-thumbnails", outcome: "completed", message: msg, finishedAt: Date.now() }, startedAt)
      }),
    ),
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        finishActive({ id: taskId, type: "gen-thumbnails", outcome: "cancelled", message: `cancelled after ${processed} processed`, finishedAt: Date.now() }, startedAt)
      }),
    ),
    Effect.catchAllDefect(() =>
      Effect.sync(() => {
        finishActive({ id: taskId, type: "gen-thumbnails", outcome: "failed", message: `failed after ${processed} processed`, finishedAt: Date.now() }, startedAt)
      }),
    ),
    Effect.asVoid,
  )
}

// ---- Gen-Highlights task ----

function buildGenHighlightsEffect(
  taskId: number,
  params: GenHighlightsParams,
): Effect.Effect<void, never, Database | FileSystem.FileSystem> {
  let processed = 0
  const startedAt = activeTask?.startedAt ?? Date.now()
  const onStatus = (status: string) => {
    updateStatus(taskId, status)
    const m = status.match(/^(\d+)/)
    if (m) processed = Number(m[1])
  }

  return runGenHighlights(params, onStatus).pipe(
    Effect.tap(({ count, avgSize }) =>
      Effect.sync(() => {
        const msg = count === 0 ? "nothing generated" : `${count} highlights generated, avg ${humanSize(avgSize)}`
        finishActive({ id: taskId, type: "gen-highlights", outcome: "completed", message: msg, finishedAt: Date.now() }, startedAt)
      }),
    ),
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        finishActive({ id: taskId, type: "gen-highlights", outcome: "cancelled", message: `cancelled after ${processed} processed`, finishedAt: Date.now() }, startedAt)
      }),
    ),
    Effect.catchAllDefect(() =>
      Effect.sync(() => {
        finishActive({ id: taskId, type: "gen-highlights", outcome: "failed", message: `failed after ${processed} processed`, finishedAt: Date.now() }, startedAt)
      }),
    ),
    Effect.asVoid,
  )
}
