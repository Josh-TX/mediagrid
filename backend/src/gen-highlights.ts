import { Effect } from "effect"
import * as path from "node:path"
import * as fs from "node:fs"
import * as os from "node:os"
import * as child_process from "node:child_process"
import { promisify } from "node:util"
import { Database } from "./db"
import { applySimpleFilter, applyPresetFilter } from "./filter"

const execFile = promisify(child_process.execFile)

const DATA_DIR = process.env["DATA_DIR"] ?? "/data"
const MEDIA_DIR = process.env["MEDIA_DIR"] ?? "/media"

export interface GenHighlightsParams {
  resolution: number
  override: boolean
  simpleFilter: string
  usePresetFilter: boolean
  presetName: string | null
  highlightDuration: number
  segmentCount: number
  ffmpegArg: string
}

function computeTargetWidth(pixelArea: number, width: number, height: number): number {
  const w = Math.round(Math.sqrt(pixelArea * (width / height)))
  return Math.round(w / 2) * 2
}

function splitFfmpegArg(arg: string): string[] {
  return arg.split(/\s+/).filter(Boolean)
}

function ffmpegEffect(args: string[], label: string): Effect.Effect<void, never, never> {
  return Effect.tryPromise({
    try: () => execFile("ffmpeg", ["-y", ...args]).then(() => undefined),
    catch: (e) => e,
  }).pipe(
    Effect.tapError((e) => Effect.sync(() => console.error(`gen-highlights: ffmpeg failed for ${label}:`, e))),
    Effect.orElse(() => Effect.void),
  )
}

/** Runs the gen-highlights workload; returns { count, avgSize } on completion. */
export function runGenHighlights(
  params: GenHighlightsParams,
  onStatus: (status: string) => void,
): Effect.Effect<{ count: number; avgSize: number }, never, Database> {
  return Effect.gen(function* () {
    const db = yield* Database
    const all = yield* db.getAllMedia()

    let filtered = applySimpleFilter(all, params.simpleFilter)

    if (params.usePresetFilter && params.presetName !== null) {
      const preset = yield* db.getPresetByName(params.presetName)
      if (preset) filtered = applyPresetFilter(filtered, preset)
    }

    filtered = filtered.filter((m) => m.media_type === 1)

    const highlightsDir = path.join(DATA_DIR, "highlights")
    const toProcess = params.override
      ? filtered
      : filtered.filter((m) => !fs.existsSync(path.join(highlightsDir, `${m.path}.mp4`)))

    const total = toProcess.length
    onStatus(`0 / ${total}`)

    const { highlightDuration, segmentCount } = params
    const segmentDuration = highlightDuration / segmentCount
    const extraArgs = splitFfmpegArg(params.ffmpegArg)

    const generatedSizes: number[] = []
    let processed = 0

    for (const media of toProcess) {
      const durationMs = media.duration ?? 0
      const durationSec = durationMs / 1000

      if (durationSec < highlightDuration) {
        processed++
        onStatus(`${processed} / ${total}`)
        continue
      }

      const inputPath = path.join(MEDIA_DIR, media.path)
      const outputPath = path.join(highlightsDir, `${media.path}.mp4`)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })

      const targetW = computeTargetWidth(params.resolution, media.width, media.height)
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "highlight-"))
      const tempFiles: string[] = []

      try {
        for (let i = 0; i < segmentCount; i++) {
          const bucketStart = (i / segmentCount) * durationSec
          const segmentStart = bucketStart + durationSec / segmentCount / 2
          const tempFile = path.join(tempDir, `seg_${i}.mp4`)
          tempFiles.push(tempFile)

          yield* ffmpegEffect([
            "-ss", String(segmentStart),
            "-i", inputPath,
            "-t", String(segmentDuration),
            "-an",
            "-vf", `scale=${targetW}:-2`,
            ...extraArgs,
            tempFile,
          ], `${media.path} seg ${i}`)
        }

        const concatFile = path.join(tempDir, "concat.txt")
        fs.writeFileSync(concatFile, tempFiles.map((f) => `file '${f}'`).join("\n"), "utf8")

        yield* ffmpegEffect([
          "-f", "concat",
          "-safe", "0",
          "-i", concatFile,
          "-c", "copy",
          "-an",
          outputPath,
        ], `${media.path} concat`)

        if (fs.existsSync(outputPath)) {
          generatedSizes.push(fs.statSync(outputPath).size)
        }
      } finally {
        for (const f of tempFiles) {
          try { fs.unlinkSync(f) } catch { /* ignore */ }
        }
        try { fs.rmdirSync(tempDir) } catch { /* ignore */ }
      }

      processed++
      onStatus(`${processed} / ${total}`)
    }

    const count = generatedSizes.length
    const avgSize = count > 0 ? generatedSizes.reduce((a, b) => a + b, 0) / count : 0
    return { count, avgSize }
  })
}
