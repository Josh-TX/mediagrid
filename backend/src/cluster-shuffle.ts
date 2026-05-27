import type { MediaRecord } from "./db"

export interface DebugCluster {
  count: number
  tilesPerRow: number
  aspectRatio: number
}

export interface InternalTileInfo {
  index: number
  width: number
  preview: MediaRecord
}

export interface InternalBlockInfo {
  index: number
  isFull: boolean
  tiles: InternalTileInfo[]
}

export interface ShuffleLayout {
  blocks: InternalBlockInfo[]
  media: MediaRecord[]
  debugClusters: DebugCluster[]
}

interface Cluster {
  items: MediaRecord[]
  centroid: number
  ctpb: number
}

/** Fisher-Yates shuffle in place using Math.random(). */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i] as T
    arr[i] = arr[j] as T
    arr[j] = tmp
  }
  return arr
}

function aspectRatio(item: MediaRecord): number {
  return item.width / item.height
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

/**
 * 1D k-means clustering on aspect ratios.
 * Returns k clusters (some may be empty if k > distinct aspect ratios).
 */
function kmeans(items: MediaRecord[], k: number): Cluster[] {
  const ratios = items.map(aspectRatio)
  const minR = Math.min(...ratios)
  const maxR = Math.max(...ratios)

  // Initialize centroids evenly spaced across the aspect ratio range.
  let centroids: number[]
  if (k === 1 || minR === maxR) {
    centroids = [minR]
  } else {
    centroids = Array.from({ length: k }, (_, i) => minR + (i / (k - 1)) * (maxR - minR))
  }

  let assignments = new Array<number>(items.length).fill(0)

  for (let iter = 0; iter < 50; iter++) {
    // Assign each item to the nearest centroid.
    const newAssignments = items.map((item) => {
      const r = aspectRatio(item)
      let best = 0
      let bestDist = Math.abs(r - centroids[0]!)
      for (let c = 1; c < centroids.length; c++) {
        const d = Math.abs(r - centroids[c]!)
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
      return best
    })

    // Recompute centroids.
    const newCentroids = centroids.map((prev, c) => {
      const members = items.filter((_, i) => newAssignments[i] === c)
      return members.length > 0 ? mean(members.map(aspectRatio)) : prev
    })

    const changed = newAssignments.some((a, i) => a !== assignments[i])
    assignments = newAssignments
    centroids = newCentroids
    if (!changed) break
  }

  // Build cluster objects, filtering out empty clusters.
  const clusterMap = new Map<number, MediaRecord[]>()
  for (let c = 0; c < k; c++) clusterMap.set(c, [])
  items.forEach((item, i) => clusterMap.get(assignments[i]!)!.push(item))

  return [...clusterMap.entries()]
    .filter(([, members]) => members.length > 0)
    .map(([, members]) => ({
      items: members,
      centroid: mean(members.map(aspectRatio)),
      ctpb: 1,
    }))
}

/**
 * Computes tile area as a fraction of screen area for a given CTPB and cluster centroid.
 * Formula: viewportW / (CTPB² × avgAspectRatio × viewportH)
 */
function tilePercent(ctpb: number, avgAspectRatio: number, vpW: number, vpH: number): number {
  return vpW / (ctpb * ctpb * avgAspectRatio * vpH)
}

/** Computes CTPB (1–10) for a cluster that minimizes distance to target while staying under max. */
function computeCtpb(
  centroid: number,
  targetPct: number,
  maxPct: number,
  vpW: number,
  vpH: number,
): number {
  const target = targetPct / 100
  const max = maxPct / 100

  let bestCtpb = 10
  let bestDist = Infinity
  let anyUnderMax = false

  for (let c = 1; c <= 10; c++) {
    const pct = tilePercent(c, centroid, vpW, vpH)
    if (pct <= max) {
      anyUnderMax = true
      const dist = Math.abs(pct - target)
      if (dist < bestDist) {
        bestDist = dist
        bestCtpb = c
      }
    }
  }

  // If nothing fits under the max, use 10 (smallest tiles).
  return anyUnderMax ? bestCtpb : 10
}

/**
 * Builds the full block layout from filtered media using the cluster-based shuffle algorithm.
 *
 * Steps:
 * 1. K-means cluster by aspect ratio.
 * 2. Compute CTPB per cluster.
 * 3. Iteratively merge clusters whose CTPB > cluster count.
 * 4. Fill pure blocks from each cluster (complete CTPB-sized groups).
 * 5. Fill remainder blocks with leftover items using sum-closer-to-1 packing.
 */
export function buildShuffleLayout(
  media: MediaRecord[],
  clusterCount: number,
  targetTilePercent: number,
  maxTilePercent: number,
  vpW: number,
  vpH: number,
): ShuffleLayout {
  if (media.length === 0) return { blocks: [], media: [], debugClusters: [] }

  // Step 1 — cluster.
  const k = Math.min(clusterCount, media.length)
  let clusters = kmeans(media, k)

  // Step 2 — compute CTPB per cluster.
  for (const c of clusters) {
    c.ctpb = computeCtpb(c.centroid, targetTilePercent, maxTilePercent, vpW, vpH)
  }

  const debugClusters: DebugCluster[] = clusters.map((c) => ({
    count: c.items.length,
    tilesPerRow: c.ctpb,
    aspectRatio: Math.round(c.centroid * 1000) / 1000,
  }))

  // Step 3 — merge clusters whose CTPB > cluster count iteratively.
  let changed = true
  while (changed && clusters.length > 1) {
    changed = false
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i]!
      if (c.ctpb > clusters.length) {
        // Find the closest other cluster by centroid distance.
        let closestIdx = -1
        let closestDist = Infinity
        for (let j = 0; j < clusters.length; j++) {
          if (j === i) continue
          const d = Math.abs(clusters[j]!.centroid - c.centroid)
          if (d < closestDist) {
            closestDist = d
            closestIdx = j
          }
        }
        // Merge i into closestIdx.
        const target = clusters[closestIdx]!
        target.items = [...target.items, ...c.items]
        target.centroid = mean(target.items.map(aspectRatio))
        target.ctpb = computeCtpb(target.centroid, targetTilePercent, maxTilePercent, vpW, vpH)
        clusters.splice(i, 1)
        changed = true
        break // restart loop after structural change
      }
    }
  }

  // Step 4 — allocate pure blocks; collect remainder items.
  const pureBlocks: InternalBlockInfo[] = []

  interface RemainderItem {
    preview: MediaRecord
    /** Width = 1/ctpb of the item's source cluster. */
    width: number
  }
  const remainderItems: RemainderItem[] = []

  // With a single cluster, skip pure blocks — all items go to remainder.
  if (clusters.length === 1) {
    const c = clusters[0]!
    const w = 1 / c.ctpb
    shuffleArray(c.items)
    for (const item of c.items) remainderItems.push({ preview: item, width: w })
  } else {
    for (const c of clusters) {
      shuffleArray(c.items)
      const w = 1 / c.ctpb
      const fullGroups = Math.floor(c.items.length / c.ctpb)
      for (let g = 0; g < fullGroups; g++) {
        const tiles = c.items.slice(g * c.ctpb, (g + 1) * c.ctpb).map((preview) => ({ index: 0, preview, width: w }))
        pureBlocks.push({ index: 0, isFull: true, tiles })
      }
      const leftover = c.items.slice(fullGroups * c.ctpb)
      for (const item of leftover) remainderItems.push({ preview: item, width: w })
    }
    shuffleArray(pureBlocks)
  }

  // Step 5 — fill remainder blocks.
  shuffleArray(remainderItems)

  const remainderBlocks: InternalBlockInfo[] = []
  let currentTiles: { preview: MediaRecord; width: number }[] = []
  let currentSum = 0

  for (const item of remainderItems) {
    const sumAfter = currentSum + item.width
    // Add to current block if it brings the sum closer to 1.0.
    if (Math.abs(sumAfter - 1) <= Math.abs(currentSum - 1)) {
      currentTiles.push(item)
      currentSum = sumAfter
    } else {
      // Seal current block as full and start a new one.
      if (currentTiles.length > 0) {
        remainderBlocks.push({ index: 0, isFull: true, tiles: currentTiles.map((t) => ({ index: 0, width: t.width, preview: t.preview })) })
      }
      currentTiles = [item]
      currentSum = item.width
    }
  }

  // Handle the last remainder block.
  if (currentTiles.length > 0) {
    const isFull = currentSum >= 0.98
    remainderBlocks.push({ index: 0, isFull, tiles: currentTiles.map((t) => ({ index: 0, width: t.width, preview: t.preview })) })
  }

  // Step 6 — assemble final block list and assign indices.
  const allBlocks: InternalBlockInfo[] = [...pureBlocks, ...remainderBlocks]

  const flatMedia: MediaRecord[] = []
  let globalIndex = 0

  const finalBlocks: InternalBlockInfo[] = allBlocks.map((block, blockIndex) => {
    const tiles = block.tiles.map((tile) => {
      const idx = globalIndex++
      flatMedia.push(tile.preview)
      return { index: idx, width: tile.width, preview: tile.preview }
    })
    return { index: blockIndex, isFull: block.isFull, tiles }
  })

  return { blocks: finalBlocks, media: flatMedia, debugClusters }
}

export type SortType = "random" | "size" | "az" | "date"
export type SortDir = "asc" | "desc"

/**
 * Builds a block layout from sorted media (non-random sort modes).
 *
 * Tile width formula: sqrt(targetTilePercent% × vpW × vpH × AR) / vpW
 * — gives each tile a width such that its area equals targetTilePercent% of the viewport.
 *
 * Block packing (greedy, in sort order):
 * 1. Max tile check (priority): if closing the block now would normalize any existing tile above
 *    maxTilePercent%, force-add the current item regardless.
 * 2. Otherwise, add if it brings the running sum closer to 1.0; else seal and start a new block.
 *
 * isFull = rawSum > 1.0; the last block may have isFull=false if it doesn't exceed 1.0.
 */
export function buildSortedLayout(
  media: MediaRecord[],
  sort: Exclude<SortType, "random">,
  dir: SortDir,
  targetTilePercent: number,
  maxTilePercent: number,
  vpW: number,
  vpH: number,
): ShuffleLayout {
  if (media.length === 0) return { blocks: [], media: [], debugClusters: [] }

  // Sort a copy so we don't mutate the caller's array.
  const sorted = [...media].sort((a, b) => {
    let cmp: number
    if (sort === "size") cmp = a.filesize - b.filesize
    else if (sort === "az") cmp = a.path.localeCompare(b.path)
    else cmp = a.mdate - b.mdate // date
    return dir === "asc" ? cmp : -cmp
  })

  const targetFraction = targetTilePercent / 100
  const maxFraction = maxTilePercent / 100

  /** Raw (un-normalized) tile widths for a media item based on its aspect ratio. */
  function tileWidth(m: MediaRecord): { target: number; max: number } {
    const ar = m.width / m.height
    const target = Math.sqrt(targetFraction * vpW * vpH * ar) / vpW
    const max = Math.sqrt(maxFraction * vpW * vpH * ar) / vpW
    return { target, max }
  }

  const internalBlocks: InternalBlockInfo[] = []
  let currentTiles: { preview: MediaRecord; width: number; maxWidth: number }[] = []
  let currentSum = 0
  let currentSumMaxWidth = 0

  function sealBlock(isFull: boolean) {
    if (currentTiles.length === 0) return
    isFull = isFull  || currentSum > 1.0
    internalBlocks.push({
      index: 0,
      isFull,
      tiles: currentTiles.map((t) => ({ index: 0, width: t.width, preview: t.preview })),
    })
    currentTiles = []
    currentSum = 0
    currentSumMaxWidth = 0
  }

  for (const m of sorted) {
    const { target: w, max: wMax } = tileWidth(m)

    // Max tile check: if the current block can't fill a row even at max sizes, force-add.
    if (currentTiles.length > 0) {
      if (currentSumMaxWidth < 1) {
        // Force-add to prevent under-filling the block.
        currentTiles.push({ preview: m, width: w, maxWidth: wMax })
        currentSum += w
        currentSumMaxWidth += wMax
        continue
      }
    }

    // Closer-to-100% check.
    if (Math.abs(currentSum + w - 1) <= Math.abs(currentSum - 1)) {
      currentTiles.push({ preview: m, width: w, maxWidth: wMax })
      currentSum += w
      currentSumMaxWidth += wMax
    } else {
      sealBlock(true)
      currentTiles = [{ preview: m, width: w, maxWidth: wMax }]
      currentSum = w
      currentSumMaxWidth = wMax
    }
  }
  sealBlock(false)

  // Assign global indices and build flat media array.
  const flatMedia: MediaRecord[] = []
  let globalIndex = 0

  const finalBlocks: InternalBlockInfo[] = internalBlocks.map((block, blockIndex) => {
    const sum = block.tiles.reduce((acc, t) => acc + t.width, 0)
    const scale = block.isFull || sum > 1 ? 1 / sum : 1
    const tiles = block.tiles.map((tile) => {
      const idx = globalIndex++
      flatMedia.push(tile.preview)
      return { index: idx, width: tile.width * scale, preview: tile.preview }
    })
    return { index: blockIndex, isFull: block.isFull, tiles }
  })

  return { blocks: finalBlocks, media: flatMedia, debugClusters: [] }
}
