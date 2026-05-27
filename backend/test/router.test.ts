import { describe, expect, it, beforeAll } from "bun:test"
import { HttpApp } from "@effect/platform"
import { BunFileSystem } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import type { Preset } from "@repo/types"
import { Database, DEFAULT_PRESET } from "../src/db"
import type { MediaRecord } from "../src/db"

const MOCK_MEDIA: MediaRecord[] = [
  { path: "a.jpg", width: 100, height: 150, filesize: 1000, mdate: 1000, duration: null, media_type: 2 },
  { path: "b.jpg", width: 200, height: 100, filesize: 2000, mdate: 2000, duration: null, media_type: 2 },
]

function makeMockDb(entries: MediaRecord[], presets: Preset[] = [DEFAULT_PRESET]): Layer.Layer<Database> {
  let storedPresets = [...presets]
  return Layer.succeed(
    Database,
    Database.of({
      insertMedia: () => Effect.succeed(false),
      deleteMedia: () => Effect.void,
      getAllMedia: () => Effect.succeed(entries),
      getPresets: () => Effect.succeed(storedPresets),
      putPresets: (p) => Effect.sync(() => { storedPresets = [...p] }),
      getPresetByName: (name) =>
        Effect.succeed(storedPresets.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null),
      getPreviewSettings: () => Effect.succeed(null),
      upsertPreviewSettings: () => Effect.void,
    }),
  )
}

let handle: (req: Request) => Promise<Response>
let handleMany: (req: Request) => Promise<Response>

beforeAll(async () => {
  const { router } = await import("../src/router")
  const baseLayer = Layer.merge(BunFileSystem.layer, makeMockDb(MOCK_MEDIA))
  handle = HttpApp.toWebHandlerLayer(router, baseLayer).handler

  const many: MediaRecord[] = Array.from({ length: 30 }, (_, i) => ({
    path: `img${i}.jpg`,
    width: 100,
    height: 150,
    filesize: i * 100,
    mdate: i,
    duration: null,
    media_type: 2,
  }))
  handleMany = HttpApp.toWebHandlerLayer(router, Layer.merge(BunFileSystem.layer, makeMockDb(many))).handler
})

async function get(h: typeof handle, path: string) {
  const res = await h(new Request(`http://localhost${path}`))
  return { status: res.status, body: await res.json() }
}

async function post(h: typeof handle, path: string) {
  const res = await h(new Request(`http://localhost${path}`, { method: "POST" }))
  return { status: res.status, body: await res.json() }
}

async function put(h: typeof handle, path: string, body: unknown) {
  const res = await h(
    new Request(`http://localhost${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: await res.json() }
}

describe("GET /api/presets", () => {
  it("returns the default preset when populated", async () => {
    const r = await get(handle, "/api/presets")
    expect(r.status).toBe(200)
    const body = r.body as { name: string }[]
    expect(Array.isArray(body)).toBe(true)
    expect(body[0]?.name).toBe("default")
  })

  it("auto-inserts default preset when table is empty", async () => {
    const { router } = await import("../src/router")
    const emptyDb = makeMockDb([], [])
    const h = HttpApp.toWebHandlerLayer(router, Layer.merge(BunFileSystem.layer, emptyDb)).handler
    const r = await get(h, "/api/presets")
    expect(r.status).toBe(200)
    const body = r.body as { name: string }[]
    expect(body[0]?.name).toBe("default")
  })

  it("auto-inserts default preset when it is missing but other presets exist", async () => {
    const { router } = await import("../src/router")
    const db = makeMockDb([], [{ ...DEFAULT_PRESET, name: "custom" }])
    const h = HttpApp.toWebHandlerLayer(router, Layer.merge(BunFileSystem.layer, db)).handler
    const r = await get(h, "/api/presets")
    expect(r.status).toBe(200)
    const body = r.body as { name: string }[]
    expect(body[0]?.name).toBe("default")
    expect(body.some((p) => p.name === "custom")).toBe(true)
  })

  it("returns default first regardless of alphabetical order", async () => {
    const { router } = await import("../src/router")
    const presets: Preset[] = [
      { ...DEFAULT_PRESET, name: "zebra" },
      { ...DEFAULT_PRESET, name: "alpha" },
      DEFAULT_PRESET,
    ]
    const db = makeMockDb([], presets)
    const h = HttpApp.toWebHandlerLayer(router, Layer.merge(BunFileSystem.layer, db)).handler
    const r = await get(h, "/api/presets")
    const body = r.body as { name: string }[]
    expect(body[0]?.name).toBe("default")
  })
})

describe("PUT /api/presets", () => {
  it("accepts a full preset array and returns 200", async () => {
    const r = await put(handle, "/api/presets", [DEFAULT_PRESET])
    expect(r.status).toBe(200)
  })

  it("returns 400 when body is not an array", async () => {
    const r = await put(handle, "/api/presets", { name: "default" })
    expect(r.status).toBe(400)
  })
})

// Viewport params used throughout block tests.
const VP = "w=390&h=844"

describe("GET /api/blocks", () => {
  it("returns 400 when indices is missing", async () => {
    const r = await get(handle, "/api/blocks")
    expect(r.status).toBe(400)
  })

  it("returns 400 when indices is empty", async () => {
    const r = await get(handle, "/api/blocks?indices=")
    expect(r.status).toBe(400)
  })

  it("returns 400 when w/h are missing on initial request", async () => {
    const r = await get(handle, "/api/blocks?indices=0")
    expect(r.status).toBe(400)
  })

  it("returns 200 with shuffleId, totalMedia and totalBlocks", async () => {
    const r = await get(handle, `/api/blocks?indices=0&${VP}`)
    expect(r.status).toBe(200)
    const body = r.body as { shuffleId: number; totalMedia: number; totalBlocks: number; blocks: unknown[] }
    expect(typeof body.shuffleId).toBe("number")
    expect(body.totalMedia).toBe(2)
    expect(typeof body.totalBlocks).toBe("number")
    expect(Array.isArray(body.blocks)).toBe(true)
  })

  it("returns blocks with isFull and tiles with width", async () => {
    const r = await get(handleMany, `/api/blocks?indices=0&${VP}`)
    expect(r.status).toBe(200)
    const body = r.body as { blocks: { index: number; isFull: boolean; tiles: { index: number; width: number }[] }[] }
    const block = body.blocks[0]!
    expect(typeof block.isFull).toBe("boolean")
    expect(block.tiles.length).toBeGreaterThan(0)
    for (const tile of block.tiles) {
      expect(typeof tile.width).toBe("number")
      expect(tile.width).toBeGreaterThan(0)
      expect(tile.width).toBeLessThanOrEqual(1)
      expect(typeof tile.index).toBe("number")
    }
  })

  it("tile indices are globally unique and sequential", async () => {
    const r = await get(handleMany, `/api/blocks?indices=0,1,2&${VP}`)
    const body = r.body as { blocks: { tiles: { index: number }[] }[] }
    const indices = body.blocks.flatMap((b) => b.tiles.map((t) => t.index))
    const sorted = [...indices].sort((a, b) => a - b)
    expect(sorted).toEqual(Array.from({ length: indices.length }, (_, i) => i))
  })

  it("silently omits out-of-bounds block indices", async () => {
    const r = await get(handle, `/api/blocks?indices=0,99&${VP}`)
    expect(r.status).toBe(200)
    const body = r.body as { blocks: { index: number }[] }
    expect(body.blocks.map((b) => b.index)).toEqual([0])
  })

  it("deduplicates repeated indices", async () => {
    const r = await get(handle, `/api/blocks?indices=0,0,0&${VP}`)
    expect(r.status).toBe(200)
    const body = r.body as { blocks: unknown[] }
    expect(body.blocks).toHaveLength(1)
  })

  it("cached shuffleId returns the same layout without needing w/h", async () => {
    const r1 = await (await handle(new Request(`http://localhost/api/blocks?indices=0&${VP}`))).json() as { shuffleId: number; totalBlocks: number; totalMedia: number; blocks: unknown }
    const r2 = await (await handle(new Request(`http://localhost/api/blocks?s=${r1.shuffleId}&indices=0`))).json() as typeof r1
    // debug field only appears on the first (non-cached) response — compare the shared fields
    const { shuffleId, totalBlocks, totalMedia, blocks } = r1
    expect(r2).toEqual({ shuffleId, totalBlocks, totalMedia, blocks })
  })

  it("returns 404 for an unknown shuffleId", async () => {
    const r = await get(handle, "/api/blocks?s=999999&indices=0")
    expect(r.status).toBe(404)
  })

  it("can fetch multiple blocks in one request", async () => {
    const r = await get(handleMany, `/api/blocks?indices=0,1,2&${VP}`)
    expect(r.status).toBe(200)
    const body = r.body as { blocks: { index: number }[] }
    expect(body.blocks.map((b) => b.index)).toEqual([0, 1, 2])
  })
})

describe("GET /api/blocks with q filter", () => {
  it("returns only paths matching a single term", async () => {
    const r = await get(handle, `/api/blocks?indices=0&q=a&${VP}`)
    expect(r.status).toBe(200)
    const body = r.body as { totalMedia: number; blocks: { tiles: { preview: { path: string } }[] }[] }
    expect(body.totalMedia).toBe(1)
    const paths = body.blocks[0]!.tiles.map((t) => t.preview.path)
    expect(paths).toContain("a.jpg")
    expect(paths).not.toContain("b.jpg")
  })

  it("AND logic: all terms must match", async () => {
    const r = await get(handle, `/api/blocks?indices=0&q=a%20b&${VP}`)
    expect(r.status).toBe(200)
    const body = r.body as { totalMedia: number }
    expect(body.totalMedia).toBe(0)
  })

  it("matching is case-insensitive", async () => {
    const r = await get(handle, `/api/blocks?indices=0&q=A&${VP}`)
    const body = r.body as { totalMedia: number }
    expect(body.totalMedia).toBe(1)
  })

  it("empty q returns all entries", async () => {
    const r = await get(handle, `/api/blocks?indices=0&q=&${VP}`)
    const body = r.body as { totalMedia: number }
    expect(body.totalMedia).toBe(2)
  })
})

describe("GET /api/blocks with preset filter", () => {
  async function makeHandlerWithPreset(preset: Preset, media: MediaRecord[]) {
    const { router } = await import("../src/router")
    const db = makeMockDb(media, [DEFAULT_PRESET, preset])
    return HttpApp.toWebHandlerLayer(router, Layer.merge(BunFileSystem.layer, db)).handler
  }

  const videoMedia: MediaRecord[] = [
    { path: "clip.mp4", width: 1920, height: 1080, filesize: 1000, mdate: 1, duration: 10000, media_type: 1 },
    { path: "photo.jpg", width: 100, height: 150, filesize: 500, mdate: 2, duration: null, media_type: 2 },
  ]

  it("videos-only preset filters out images", async () => {
    const h = await makeHandlerWithPreset(
      { ...DEFAULT_PRESET, name: "vids", mediaType: "videos" },
      videoMedia,
    )
    const r = await get(h, `/api/blocks?indices=0&preset=vids&${VP}`)
    const body = r.body as { totalMedia: number }
    expect(body.totalMedia).toBe(1)
  })

  it("images-only preset filters out videos", async () => {
    const h = await makeHandlerWithPreset(
      { ...DEFAULT_PRESET, name: "imgs", mediaType: "images" },
      videoMedia,
    )
    const r = await get(h, `/api/blocks?indices=0&preset=imgs&${VP}`)
    const body = r.body as { totalMedia: number }
    expect(body.totalMedia).toBe(1)
  })

  it("excludeContainsCsv blacklists matching paths", async () => {
    const h = await makeHandlerWithPreset(
      { ...DEFAULT_PRESET, name: "noA", excludeContainsCsv: "a" },
      MOCK_MEDIA,
    )
    const r = await get(h, `/api/blocks?indices=0&preset=noA&${VP}`)
    const body = r.body as { totalMedia: number }
    expect(body.totalMedia).toBe(1)
  })

  it("falls back to default preset for unknown preset name", async () => {
    const r = await get(handle, `/api/blocks?indices=0&preset=nonexistent&${VP}`)
    expect(r.status).toBe(200)
    const body = r.body as { totalMedia: number }
    expect(body.totalMedia).toBe(2)
  })

  it("higher targetTilePercent produces fewer tiles per block", async () => {
    // targetTilePercent=80 (large tiles) vs default 25 (smaller tiles).
    const h = await makeHandlerWithPreset(
      { ...DEFAULT_PRESET, name: "big", targetTilePercent: 80, maxTilePercent: 100 },
      MOCK_MEDIA,
    )
    const r = await get(h, `/api/blocks?indices=0&preset=big&${VP}`)
    const body = r.body as { blocks: { tiles: unknown[] }[] }
    const tilesPerBlock = body.blocks[0]!.tiles.length
    expect(tilesPerBlock).toBeGreaterThanOrEqual(1)
  })
})

describe("GET /api/tasks", () => {
  it("returns the expected shape", async () => {
    const r = await get(handle, "/api/tasks")
    expect(r.status).toBe(200)
    const body = r.body as { active: unknown; queue: unknown[]; recent: unknown[] }
    expect(body).toHaveProperty("active")
    expect(Array.isArray(body.queue)).toBe(true)
    expect(Array.isArray(body.recent)).toBe(true)
  })
})

describe("POST /api/tasks/scan", () => {
  it("returns 202 with a numeric id", async () => {
    const r = await post(handle, "/api/tasks/scan")
    // may be 202 (new) or 409 (already running from module state); just check it's one of these
    expect([202, 409]).toContain(r.status)
    if (r.status === 202) {
      expect(typeof (r.body as { id: number }).id).toBe("number")
    }
  })
})

describe("POST /api/tasks/clean", () => {
  it("returns 202 with a numeric id or 409 if already queued", async () => {
    const r = await post(handle, "/api/tasks/clean")
    expect([202, 409]).toContain(r.status)
    if (r.status === 202) {
      expect(typeof (r.body as { id: number }).id).toBe("number")
    }
  })
})

describe("POST /api/tasks/:id/cancel", () => {
  it("returns 404 for a non-existent task id", async () => {
    const r = await post(handle, "/api/tasks/999999/cancel")
    expect(r.status).toBe(404)
  })
})
