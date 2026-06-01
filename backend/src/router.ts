import { Headers, HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import * as path from "node:path"
import * as fs from "node:fs"
import { Database, DEFAULT_PRESET } from "./db"
import { buildShuffleLayout, buildSortedLayout } from "./cluster-shuffle"
import type { SortType, SortDir } from "./cluster-shuffle"
import { storeShuffleCache, getShuffleCache } from "./shuffle-cache"
import { enqueueScan, enqueueClean, enqueueGenThumbnails, enqueueGenHighlights, cancelTaskById, getTasksState } from "./tasks"
import { applySimpleFilter, applyPresetFilter } from "./filter"
import type { BlockInfo, MediaInfo, Preset, PreviewInfo } from "@repo/types"
import type { MediaRecord } from "./db"
import type { InternalBlockInfo } from "./cluster-shuffle"
import type { GenThumbnailsParams } from "./gen-thumbnails"
import type { GenHighlightsParams } from "./gen-highlights"

/** In-memory temp preset store keyed by sessionId. Cleared on server restart. */
const tempPresetStore = new Map<string, Preset[]>()

/** Ensures the "default" preset exists in the array, injecting DEFAULT_PRESET if missing. */
function ensureDefaultPreset(presets: Preset[]): Preset[] {
  if (presets.some((p) => p.name.toLowerCase() === "default")) return presets
  return [DEFAULT_PRESET, ...presets]
}

const MEDIA_DIR = process.env["MEDIA_DIR"] ?? "/media"
const DATA_DIR = process.env["DATA_DIR"] ?? "/data"
const STATIC_DIR = process.env["STATIC_DIR"] ?? ""
const THUMBNAILS_DIR = path.join(DATA_DIR, "thumbnails")
const HIGHLIGHTS_DIR = path.join(DATA_DIR, "highlights")

function resolvePreviewType(record: MediaRecord): PreviewInfo["previewType"] {
  const thumbPath = path.join(THUMBNAILS_DIR, `${record.path}.webp`)
  if (record.media_type === 1) {
    const highlightPath = path.join(HIGHLIGHTS_DIR, `${record.path}.mp4`)
    if (fs.existsSync(highlightPath)) return "highlight"
    if (fs.existsSync(thumbPath)) return "thumbnail"
    return "placeholder"
  }
  return fs.existsSync(thumbPath) ? "thumbnail" : "original"
}

function toBlockInfo(block: InternalBlockInfo): BlockInfo {
  return {
    index: block.index,
    tiles: block.tiles.map((tile) => ({
      ...tile,
      preview: { ...tile.preview, previewType: resolvePreviewType(tile.preview) },
    })),
  }
}

function parseIntParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key)
  if (raw === null) return null
  const n = Number(raw)
  return Number.isInteger(n) ? n : null
}

/**
 * Resolves a preset by name from the temp store (if provided) or the DB.
 * Falls back to the temp/permanent default if the name isn't found.
 */
function resolvePreset(name: string | null, tempPresets?: Preset[]): Effect.Effect<Preset, never, Database> {
  if (tempPresets) {
    const found = tempPresets.find((p) => p.name.toLowerCase() === (name ?? "default").toLowerCase())
    const fallback = tempPresets.find((p) => p.name.toLowerCase() === "default") ?? DEFAULT_PRESET
    return Effect.succeed(found ?? fallback)
  }
  return Effect.gen(function* () {
    const db = yield* Database
    const found = yield* db.getPresetByName(name ?? "default")
    return found ?? DEFAULT_PRESET
  })
}


function sortPresets(presets: Preset[]): Preset[] {
  return [...presets].sort((a, b) => {
    if (a.name.toLowerCase() === "default") return -1
    if (b.name.toLowerCase() === "default") return 1
    return a.name.localeCompare(b.name)
  })
}

const presetsGetHandler = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const url = new URL(req.url, "http://localhost")
  const sessionId = url.searchParams.get("sessionId")

  if (sessionId && tempPresetStore.has(sessionId)) {
    const presets = sortPresets(ensureDefaultPreset(tempPresetStore.get(sessionId)!))
    return yield* HttpServerResponse.json({ presets, isTemp: true })
  }

  const db = yield* Database
  let presets = yield* db.getPresets()
  if (!presets.some((p) => p.name.toLowerCase() === "default")) {
    presets = [DEFAULT_PRESET, ...presets]
    yield* db.putPresets(presets)
  }
  return yield* HttpServerResponse.json({ presets: sortPresets(presets), isTemp: false })
})

const presetsPutHandler = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const body: unknown = yield* req.json
  if (!Array.isArray(body)) {
    return yield* HttpServerResponse.json({ error: "expected array" }, { status: 400 })
  }
  const db = yield* Database
  yield* db.putPresets(body as Preset[])
  return yield* HttpServerResponse.json({ ok: true })
})

const presetsTempPutHandler = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const body = (yield* req.json) as { sessionId?: string; presets: Preset[] }
  if (!Array.isArray(body?.presets)) {
    return yield* HttpServerResponse.json({ error: "expected presets array" }, { status: 400 })
  }
  const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : crypto.randomUUID()
  tempPresetStore.set(sessionId, ensureDefaultPreset(body.presets as Preset[]))
  return yield* HttpServerResponse.json({ sessionId })
})

const blocksHandler = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const url = new URL(req.url, "http://localhost")

  const indicesRaw = url.searchParams.get("indices")
  if (!indicesRaw || !indicesRaw.trim()) {
    return yield* HttpServerResponse.json({ error: "indices is required" }, { status: 400 })
  }
  const requestedIndices = [
    ...new Set(
      indicesRaw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0),
    ),
  ]

  const shuffleIdParam = parseIntParam(url.searchParams, "s")
  const presetName = url.searchParams.get("preset")
  const sessionId = url.searchParams.get("sessionId")
  const tempPresets = sessionId ? tempPresetStore.get(sessionId) : undefined
  const preset: Preset = yield* resolvePreset(presetName, tempPresets)

  let shuffleId: number
  let totalBlocks: number
  let totalMedia: number
  let blocks: BlockInfo[]

  if (shuffleIdParam !== null) {
    const cached = getShuffleCache(shuffleIdParam)
    if (!cached) {
      return yield* HttpServerResponse.json({ error: "shuffle not found" }, { status: 404 })
    }
    shuffleId = shuffleIdParam
    totalBlocks = cached.blocks.length
    totalMedia = cached.media.length
    blocks = requestedIndices
      .filter((i) => i < cached.blocks.length)
      .map((i) => toBlockInfo(cached.blocks[i]!))
  } else {
    const vpW = parseIntParam(url.searchParams, "w")
    const vpH = parseIntParam(url.searchParams, "h")
    if (vpW === null || vpH === null || vpW <= 0 || vpH <= 0) {
      return yield* HttpServerResponse.json({ error: "w and h (viewport dimensions) are required" }, { status: 400 })
    }
    const q = url.searchParams.get("q") ?? ""
    const sortParam = url.searchParams.get("sort")
    const dirParam = url.searchParams.get("dir")
    const sort: SortType = (sortParam === "size" || sortParam === "az" || sortParam === "date") ? sortParam : "random"
    const dir: SortDir = dirParam === "desc" ? "desc" : "asc"
    const db = yield* Database
    const all = yield* db.getAllMedia()
    const afterQ = applySimpleFilter(all, q)
    const filtered = applyPresetFilter(afterQ, preset).map((m) => ({ ...m, path: m.path.replace(/^\//, "") }))
    const layout = sort === "random"
      ? buildShuffleLayout(filtered, preset.clusterCount, preset.targetTilePercent, preset.maxTilePercent, vpW, vpH)
      : buildSortedLayout(filtered, sort, dir, preset.targetTilePercent, preset.maxTilePercent, vpW, vpH)
    shuffleId = storeShuffleCache(layout)
    totalBlocks = layout.blocks.length
    totalMedia = layout.media.length
    blocks = requestedIndices
      .filter((i) => i < layout.blocks.length)
      .map((i) => toBlockInfo(layout.blocks[i]!))
    return yield* HttpServerResponse.json({ shuffleId, totalBlocks, totalMedia, blocks, debug: layout.debugClusters })
  }

  return yield* HttpServerResponse.json({ shuffleId, totalBlocks, totalMedia, blocks })
})

const mediaInfoHandler = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const url = new URL(req.url, "http://localhost")

  const shuffleId = parseIntParam(url.searchParams, "s")
  if (shuffleId === null) {
    return yield* HttpServerResponse.json({ error: "s (shuffleId) is required" }, { status: 404 })
  }

  const cached = getShuffleCache(shuffleId)
  if (!cached) {
    return yield* HttpServerResponse.json({ error: "shuffle not found" }, { status: 404 })
  }

  const indexesRaw = url.searchParams.get("indexes")
  if (!indexesRaw || !indexesRaw.trim()) {
    return yield* HttpServerResponse.json({ error: "indexes is required" }, { status: 400 })
  }
  const requestedIndexes = indexesRaw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n))

  const result: (MediaInfo | null)[] = requestedIndexes.map((i) => {
    if (i < 0 || i >= cached.media.length) return null
    const m = cached.media[i]!
    return { path: m.path, width: m.width, height: m.height, duration: m.duration, media_type: m.media_type, filesize: m.filesize, mdate: m.mdate }
  })

  return yield* HttpServerResponse.json(result)
})

const tasksGetHandler = Effect.gen(function* () {
  return yield* HttpServerResponse.json(getTasksState())
})

const scanPostHandler = Effect.gen(function* () {
  const result = yield* enqueueScan()
  if (result === null) {
    return yield* HttpServerResponse.json({ error: "Scan already queued" }, { status: 409 })
  }
  return yield* HttpServerResponse.json({ id: result.id }, { status: 202 })
})

const cleanPostHandler = Effect.gen(function* () {
  const result = yield* enqueueClean()
  if (result === null) {
    return yield* HttpServerResponse.json({ error: "Clean already queued" }, { status: 409 })
  }
  return yield* HttpServerResponse.json({ id: result.id }, { status: 202 })
})

const previewSettingsGetHandler = Effect.gen(function* () {
  const db = yield* Database
  const settings = yield* db.getPreviewSettings()
  if (settings === null) {
    return yield* HttpServerResponse.json({
      thumbCompression: 50,
      thumbResolution: 250000,
      highlightResolution: 250000,
      highlightDuration: 6,
      highlightSegmentCount: 10,
      highlightFfmpegArg: "-c:v libx264 -crf 25 -preset fast",
    })
  }
  return yield* HttpServerResponse.json(settings)
})

const genThumbnailsPostHandler = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const body = (yield* req.json) as GenThumbnailsParams & { sessionId?: string }

  const params: GenThumbnailsParams = {
    compression: body.compression,
    resolution: body.resolution,
    override: body.override,
    simpleFilter: body.simpleFilter,
    usePresetFilter: body.usePresetFilter,
    presetName: body.presetName,
  }

  if (params.usePresetFilter && params.presetName !== null && body.sessionId) {
    const tempPresets = tempPresetStore.get(body.sessionId)
    if (tempPresets) {
      params.presetData = yield* resolvePreset(params.presetName, tempPresets)
    }
  }

  const db = yield* Database
  const existing = yield* db.getPreviewSettings()
  yield* db.upsertPreviewSettings({
    thumbCompression: params.compression,
    thumbResolution: params.resolution,
    highlightResolution: existing?.highlightResolution ?? 250000,
    highlightDuration: existing?.highlightDuration ?? 6,
    highlightSegmentCount: existing?.highlightSegmentCount ?? 10,
    highlightFfmpegArg: existing?.highlightFfmpegArg ?? "-c:v libx264 -crf 25 -preset fast",
  })

  const result = yield* enqueueGenThumbnails(params)
  return yield* HttpServerResponse.json({ id: result.id }, { status: 202 })
})

const genHighlightsPostHandler = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const body = (yield* req.json) as GenHighlightsParams & { sessionId?: string }

  const params: GenHighlightsParams = {
    resolution: body.resolution,
    override: body.override,
    simpleFilter: body.simpleFilter,
    usePresetFilter: body.usePresetFilter,
    presetName: body.presetName,
    highlightDuration: body.highlightDuration,
    segmentCount: body.segmentCount,
    ffmpegArg: body.ffmpegArg,
  }

  if (params.usePresetFilter && params.presetName !== null && body.sessionId) {
    const tempPresets = tempPresetStore.get(body.sessionId)
    if (tempPresets) {
      params.presetData = yield* resolvePreset(params.presetName, tempPresets)
    }
  }

  const db = yield* Database
  const existing = yield* db.getPreviewSettings()
  yield* db.upsertPreviewSettings({
    thumbCompression: existing?.thumbCompression ?? 50,
    thumbResolution: existing?.thumbResolution ?? 250000,
    highlightResolution: params.resolution,
    highlightDuration: params.highlightDuration,
    highlightSegmentCount: params.segmentCount,
    highlightFfmpegArg: params.ffmpegArg,
  })

  const result = yield* enqueueGenHighlights(params)
  return yield* HttpServerResponse.json({ id: result.id }, { status: 202 })
})

const cancelTaskHandler = Effect.gen(function* () {
  const ctx = yield* HttpRouter.RouteContext
  const id = Number(ctx.params["id"])
  if (!Number.isInteger(id)) {
    return yield* HttpServerResponse.json({ error: "invalid id" }, { status: 400 })
  }
  const found = yield* cancelTaskById(id)
  if (!found) {
    return yield* HttpServerResponse.json({ error: "task not found" }, { status: 404 })
  }
  return yield* HttpServerResponse.json({ ok: true })
})

function makeFileHandler(baseDir: string, urlPrefix: RegExp) {
  return Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest
    const url = new URL(req.url, "http://localhost")
    const rel = decodeURIComponent(url.pathname.replace(urlPrefix, ""))
    const abs = path.resolve(baseDir, rel)
    if (!abs.startsWith(path.resolve(baseDir))) {
      return yield* HttpServerResponse.text("Forbidden", { status: 403 })
    }
    if (!fs.existsSync(abs)) {
      return yield* HttpServerResponse.text("Not found", { status: 404 })
    }
    const file = Bun.file(abs)
    const fileSize = file.size
    const rangeHeader = req.headers["range"]
    if (rangeHeader) {
      const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader)
      if (match) {
        const start = parseInt(match[1]!)
        const end = match[2] ? parseInt(match[2]) : fileSize - 1
        const chunkSize = end - start + 1
        return yield* HttpServerResponse.raw(file.slice(start, end + 1).stream(), {
          status: 206,
          headers: Headers.fromInput({
            "content-type": file.type,
            "accept-ranges": "bytes",
            "content-range": `bytes ${start}-${end}/${fileSize}`,
            "content-length": String(chunkSize),
          }),
        })
      }
    }
    return yield* HttpServerResponse.raw(file.stream(), {
      headers: Headers.fromInput({
        "content-type": file.type,
        "accept-ranges": "bytes",
        "content-length": String(fileSize),
      }),
    })
  })
}

const fileHandler = makeFileHandler(MEDIA_DIR, /^\/media\//)
const thumbnailsHandler = makeFileHandler(THUMBNAILS_DIR, /^\/thumbnails\//)
const highlightsHandler = makeFileHandler(HIGHLIGHTS_DIR, /^\/highlights\//)

const staticHandler = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const url = new URL(req.url, "http://localhost")
  let rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "")
  let abs = path.join(STATIC_DIR, rel)
  if (!fs.existsSync(abs)) {
    abs = path.join(STATIC_DIR, "index.html")
  }
  const file = Bun.file(abs)
  return yield* HttpServerResponse.raw(file.stream(), {
    headers: Headers.fromInput({ "content-type": file.type }),
  })
})

const apiRoutes = (r: typeof HttpRouter.empty) =>
  r.pipe(
    HttpRouter.get("/api/presets", presetsGetHandler),
    HttpRouter.put("/api/presets", presetsPutHandler),
    HttpRouter.put("/api/presets/temp", presetsTempPutHandler),
    HttpRouter.get("/api/blocks", blocksHandler),
    HttpRouter.get("/api/media-info", mediaInfoHandler),
    HttpRouter.get("/api/tasks", tasksGetHandler),
    HttpRouter.post("/api/tasks/scan", scanPostHandler),
    HttpRouter.post("/api/tasks/clean", cleanPostHandler),
    HttpRouter.post("/api/tasks/gen-thumbnails", genThumbnailsPostHandler),
    HttpRouter.post("/api/tasks/gen-highlights", genHighlightsPostHandler),
    HttpRouter.post("/api/tasks/:id/cancel", cancelTaskHandler),
    HttpRouter.get("/api/preview-settings", previewSettingsGetHandler),
    HttpRouter.get("/media/*", fileHandler),
    HttpRouter.get("/thumbnails/*", thumbnailsHandler),
    HttpRouter.get("/highlights/*", highlightsHandler),
  )

export const router = STATIC_DIR
  ? apiRoutes(HttpRouter.empty).pipe(HttpRouter.get("/*", staticHandler))
  : apiRoutes(HttpRouter.empty)
