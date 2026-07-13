import { describe, it, expect, beforeEach } from 'vitest'
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

// galleryStore is a module-level singleton; reset its state before each test.
beforeEach(() => {
  galleryStore.state.rows = makeRows(3, 2) // tilei 0-5 across 3 rows
  galleryStore.state.totalRows = 3
  galleryStore.state.totalTiles = 6
})

describe('galleryStore.renameTile', () => {
  it('patches only the matching tile in place, leaving others untouched', () => {
    galleryStore.renameTile(3, 'media/renamed.jpg')

    const flat = galleryStore.state.rows.flatMap((r) => r.tiles)
    expect(flat.find((t) => t.tilei === 3)?.path).toBe('media/renamed.jpg')
    expect(flat.find((t) => t.tilei === 2)?.path).toBe('media/2.jpg')
  })

  it('is a no-op when no tile matches the given tilei', () => {
    galleryStore.renameTile(999, 'media/renamed.jpg')

    const flat = galleryStore.state.rows.flatMap((r) => r.tiles)
    expect(flat.every((t) => !t.path.includes('renamed'))).toBe(true)
  })
})
