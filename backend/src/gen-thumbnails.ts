import { Effect } from "effect"
import * as path from "node:path"
import * as fs from "node:fs"
import * as child_process from "node:child_process"
import { promisify } from "node:util"
import { Database } from "./db"
import { applySimpleFilter, applyPresetFilter } from "./filter"
import type { Preset } from "@repo/types"

const execFile = promisify(child_process.execFile)

const DATA_DIR = process.env["DATA_DIR"] ?? "/data"
const MEDIA_DIR = process.env["MEDIA_DIR"] ?? "/media"

export interface GenThumbnailsParams {
  compression: number
  resolution: number
  override: boolean
  simpleFilter: string
  usePresetFilter: boolean
  presetName: string | null
  /** Preset snapshotted at task-creation time when temp presets are active. Takes precedence over DB lookup. */
  presetData?: Preset
}

function computeTargetWidth(pixelArea: number, width: number, height: number): number {
  const w = Math.round(Math.sqrt(pixelArea * (width / height)))
  return Math.round(w / 2) * 2
}

function ffmpegEffect(args: string[], label: string): Effect.Effect<void, never, never> {
  return Effect.tryPromise({
    try: () => execFile("ffmpeg", ["-y", ...args]).then(() => undefined),
    catch: (e) => e,
  }).pipe(
    Effect.tapError((e) => Effect.sync(() => console.error(`gen-thumbnails: ffmpeg failed for ${label}:`, e))),
    Effect.orElse(() => Effect.void),
  )
}

/** Runs the gen-thumbnails workload; returns { count, avgSize } on completion. */
export function runGenThumbnails(
  params: GenThumbnailsParams,
  onStatus: (status: string) => void,
): Effect.Effect<{ count: number; avgSize: number }, never, Database> {
  return Effect.gen(function* () {
    const db = yield* Database
    const all = yield* db.getAllMedia()

    let filtered = applySimpleFilter(all, params.simpleFilter)

    if (params.usePresetFilter) {
      if (params.presetData) {
        filtered = applyPresetFilter(filtered, params.presetData)
      } else if (params.presetName !== null) {
        const preset = yield* db.getPresetByName(params.presetName)
        if (preset) filtered = applyPresetFilter(filtered, preset)
      }
    }

    const thumbsDir = path.join(DATA_DIR, "thumbnails")
    const toProcess = params.override
      ? filtered
      : filtered.filter((m) => !fs.existsSync(path.join(thumbsDir, `${m.path}.webp`)))

    const total = toProcess.length
    onStatus(`0 / ${total}`)

    const generatedSizes: number[] = []
    let processed = 0

    for (const media of toProcess) {
      const inputPath = path.join(MEDIA_DIR, media.path)
      const outputPath = path.join(thumbsDir, `${media.path}.webp`)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })

      const targetW = computeTargetWidth(params.resolution, media.width, media.height)

      if (media.media_type === 1) {
        const midpoint = (media.duration ?? 0) / 2 / 1000
        yield* ffmpegEffect([
          "-ss", String(midpoint),
          "-i", inputPath,
          "-vframes", "1",
          "-vf", `scale=${targetW}:-2`,
          "-quality", String(params.compression),
          outputPath,
        ], media.path)
      } else {
        yield* ffmpegEffect([
          "-i", inputPath,
          "-vf", `scale=${targetW}:-2`,
          "-quality", String(params.compression),
          outputPath,
        ], media.path)
      }

      if (fs.existsSync(outputPath)) {
        generatedSizes.push(fs.statSync(outputPath).size)
      }

      processed++
      onStatus(`${processed} / ${total}`)
    }

    const count = generatedSizes.length
    const avgSize = count > 0 ? generatedSizes.reduce((a, b) => a + b, 0) / count : 0
    return { count, avgSize }
  })
}
