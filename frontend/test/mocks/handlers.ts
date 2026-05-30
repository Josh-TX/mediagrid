import { http, HttpResponse } from "msw"
import type { BlockResponse, Preset, PreviewInfo } from "@repo/types"

export const PREVIEW_A: PreviewInfo = {
  path: "a.jpg",
  width: 100,
  height: 150,
  filesize: 1000,
  mdate: 1000,
  duration: null,
  media_type: 2,
  previewType: "thumbnail",
}
export const PREVIEW_B: PreviewInfo = {
  path: "b.jpg",
  width: 200,
  height: 100,
  filesize: 2000,
  mdate: 2000,
  duration: null,
  media_type: 2,
  previewType: "thumbnail",
}

export const DEFAULT_PRESET: Preset = {
  name: "default",
  targetTilePercent: 25,
  maxTilePercent: 50,
  clusterCount: 3,
  minAspectRatio: null,
  maxAspectRatio: null,
  minDuration: null,
  maxDuration: null,
  playerCropMaxX: 0.1,
  playerCropMaxY: 0.1,
  tileCropMaxX: 0.1,
  tileCropMaxY: 0.1,
  excludeContainsCsv: null,
  excludeNotContainsCsv: null,
  mediaType: "all",
  forwardPreloadCount: 1,
  backwardPreloadCount: 1,
  oneFileAtATime: false,
  rewindSeconds: 10,
  fastForwardSeconds: 10,
  showTileTitle: true,
}

// Fixed shuffleId used by the mock — not a real cache, just a stable value for tests.
export const MOCK_SHUFFLE_ID = 123456

function buildResponse(previews: PreviewInfo[], requestedIndices: number[], blockSize = 2): BlockResponse {
  const totalMedia = previews.length
  const totalBlocks = Math.ceil(totalMedia / blockSize)
  const blocks = requestedIndices
    .filter((i) => i >= 0 && i < totalBlocks)
    .map((blockIndex) => {
      const start = blockIndex * blockSize
      const tiles = previews.slice(start, start + blockSize).map((preview, li) => ({
        index: start + li,
        width: 1 / blockSize,
        preview,
      }))
      return { index: blockIndex, tiles }
    })
  return { shuffleId: MOCK_SHUFFLE_ID, totalBlocks, totalMedia, blocks }
}

export const handlers = [
  http.get("/api/presets", () => {
    return HttpResponse.json({ presets: [DEFAULT_PRESET], isTemp: false })
  }),

  http.get("/api/blocks", ({ request }) => {
    const url = new URL(request.url)
    const indicesRaw = url.searchParams.get("indices")
    if (!indicesRaw) {
      return HttpResponse.json({ error: "indices required" }, { status: 400 })
    }
    const indices = indicesRaw.split(",").map(Number).filter(Number.isInteger)
    // If s is provided, the mock just returns the same shuffle (no real cache needed for tests).
    const q = url.searchParams.get("q") ?? ""
    const terms = q.split(/\s+/).filter(Boolean).map((t) => t.toLowerCase())
    const all = [PREVIEW_A, PREVIEW_B]
    const filtered =
      terms.length === 0 ? all : all.filter((m) => terms.every((t) => m.path.toLowerCase().includes(t)))
    return HttpResponse.json(buildResponse(filtered, indices))
  }),
]
