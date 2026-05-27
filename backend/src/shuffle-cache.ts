import type { InternalBlockInfo } from "./cluster-shuffle"
import type { MediaRecord } from "./db"

export interface ShuffleCache {
  blocks: InternalBlockInfo[]
  media: MediaRecord[]
}

interface CacheEntry {
  layout: ShuffleCache
  lastAccessed: number
}

const cache = new Map<number, CacheEntry>()

const EXPIRY_MS = 60 * 60 * 1000 // 1 hour
const SWEEP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of cache) {
    if (now - entry.lastAccessed > EXPIRY_MS) cache.delete(id)
  }
}, SWEEP_INTERVAL_MS).unref()

function randomId(): number {
  return Math.floor(Math.random() * 900000) + 100000
}

export function storeShuffleCache(layout: ShuffleCache): number {
  let id = randomId()
  while (cache.has(id)) id = randomId()
  cache.set(id, { layout, lastAccessed: Date.now() })
  return id
}

/** Returns the cached layout and updates lastAccessed, or null if not found. */
export function getShuffleCache(id: number): ShuffleCache | null {
  const entry = cache.get(id)
  if (!entry) return null
  entry.lastAccessed = Date.now()
  return entry.layout
}
