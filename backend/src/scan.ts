import { FileSystem } from "@effect/platform"
import { Effect } from "effect"
import * as path from "node:path"
import * as child_process from "node:child_process"
import { promisify } from "node:util"

const execFile = promisify(child_process.execFile)
import sizeOf from "image-size"
import { Database } from "./db"

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"])
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"])

export function walk(dir: string): Effect.Effect<string[], never, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const names = yield* fs.readDirectory(dir).pipe(Effect.orElse(() => Effect.succeed([])))
    const results: string[] = []
    for (const name of names) {
      const full = path.join(dir, name)
      const info = yield* fs.stat(full).pipe(Effect.orDie)
      const ext = path.extname(name).toLowerCase()
      if (info.type === "Directory") {
        results.push(...(yield* walk(full)))
      } else if (info.type === "File" && (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext))) {
        results.push(full)
      }
    }
    return results
  })
}

interface VideoInfo {
  width: number
  height: number
  duration: number
}

async function probeVideo(file: string): Promise<VideoInfo | null> {
  try {
    const { stdout } = await execFile(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration:format=duration", "-of", "json", file],
      { encoding: "utf8" },
    )
    const data = JSON.parse(stdout) as { streams?: { width: number; height: number; duration?: string }[]; format?: { duration?: string } }
    const stream = data.streams?.[0]
    if (!stream?.width || !stream?.height) return null
    const durationSec = parseFloat(stream.duration ?? data.format?.duration ?? "0")
    return {
      width: stream.width,
      height: stream.height,
      duration: Math.round(durationSec * 1000),
    }
  } catch {
    return null
  }
}

/** Probes and upserts one file given pre-computed metadata. Returns true if inserted/updated. */
export function probeAndInsert(
  abs: string,
  rel: string,
  filesize: number,
  mdate: number,
): Effect.Effect<boolean, never, Database> {
  const ext = path.extname(abs).toLowerCase()
  const isVideo = VIDEO_EXTS.has(ext)
  return Effect.gen(function* () {
    const db = yield* Database
    if (isVideo) {
      const probe = yield* Effect.tryPromise({ try: () => probeVideo(abs), catch: () => null }).pipe(
        Effect.catchAll(() => Effect.succeed(null)),
      )
      if (!probe) return false
      return yield* db.insertMedia({ path: rel, width: probe.width, height: probe.height, filesize, mdate, duration: probe.duration, media_type: 1 })
    } else {
      const dims = yield* Effect.try({ try: () => sizeOf(abs), catch: () => null }).pipe(
        Effect.catchAll(() => Effect.succeed(null)),
      )
      if (!dims?.width || !dims?.height) return false
      const o = (dims as any).orientation ?? 1
      const [width, height] = o >= 5 && o <= 8 ? [dims.height, dims.width] : [dims.width, dims.height]
      return yield* db.insertMedia({ path: rel, width, height, filesize, mdate, duration: null, media_type: 2 })
    }
  })
}
