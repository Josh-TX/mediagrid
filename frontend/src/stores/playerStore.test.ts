import { describe, it, expect, beforeEach, vi } from 'vitest'
import { playerStore } from './playerStore'
import { galleryStore } from './galleryStore'
import type { Row, Tile } from '../types'

function makeTile(tilei: number): Tile {
  return {
    tilei,
    w: 100,
    path: `media/${tilei}.jpg`,
    isVid: false,
    duration: 0,
    filesize: 1000,
    mdate: 0,
    preview: { w: 100, h: 100, hasThumbnail: false, hasHighlight: false },
  }
}

// Builds `rowCount` rows of `tilesPerRow` tiles each, with tilei running
// sequentially across the whole set (matching the server's global ordering).
function makeRows(rowCount: number, tilesPerRow: number): Row[] {
  const rows: Row[] = []
  let tilei = 0
  for (let r = 0; r < rowCount; r++) {
    const tiles: Tile[] = []
    for (let i = 0; i < tilesPerRow; i++) tiles.push(makeTile(tilei++))
    rows.push({ rowi: r, h: 100, tiles })
  }
  return rows
}

// playerStore/galleryStore are module-level singletons; reset the relevant
// state before each test.
beforeEach(() => {
  galleryStore.state.rows = makeRows(10, 5) // 50 tiles across 10 rows
  galleryStore.state.totalRows = 10
  galleryStore.state.totalTiles = 50
  playerStore.state.open = false
  playerStore.state.currentIndex = 0
  vi.restoreAllMocks()
})

describe('playerStore', () => {
  it('open finds the tapped tile by tilei and opens', () => {
    playerStore.open(23)
    expect(playerStore.state.open).toBe(true)
    expect(playerStore.state.currentIndex).toBe(23)
  })

  it('goNext/goPrev move the index and respect list bounds', () => {
    playerStore.open(0)
    expect(playerStore.goPrev()).toBe(false)
    expect(playerStore.state.currentIndex).toBe(0)

    expect(playerStore.goNext()).toBe(true)
    expect(playerStore.state.currentIndex).toBe(1)

    playerStore.state.currentIndex = 49
    expect(playerStore.goNext()).toBe(false)
    expect(playerStore.state.currentIndex).toBe(49)
  })

  it('canGoNext/canGoPrev reflect the current position', () => {
    playerStore.open(0)
    expect(playerStore.canGoPrev.value).toBe(false)
    expect(playerStore.canGoNext.value).toBe(true)

    playerStore.state.currentIndex = 49
    expect(playerStore.canGoNext.value).toBe(false)
  })

  it('opening near the end of loaded rows proactively calls loadMore', () => {
    const loadMoreSpy = vi.spyOn(galleryStore, 'loadMore').mockResolvedValue()
    // Row 9 (last of 10 loaded rows) starts at tile index 45.
    playerStore.open(45)
    expect(loadMoreSpy).toHaveBeenCalled()
  })

  it('opening well away from the end of loaded rows does not prefetch', () => {
    const loadMoreSpy = vi.spyOn(galleryStore, 'loadMore').mockResolvedValue()
    playerStore.open(5) // row 1 of 10, nowhere near the end
    expect(loadMoreSpy).not.toHaveBeenCalled()
  })

  it('advancing next toward the end of loaded rows proactively calls loadMore', () => {
    playerStore.open(38) // row 7, not yet within the prefetch buffer
    const loadMoreSpy = vi.spyOn(galleryStore, 'loadMore').mockResolvedValue()
    playerStore.goNext() // now index 39, row 7 -> still not within buffer
    expect(loadMoreSpy).not.toHaveBeenCalled()
    playerStore.state.currentIndex = 43 // row 8, within the last 2 rows
    playerStore.goNext()
    expect(loadMoreSpy).toHaveBeenCalled()
  })
})
