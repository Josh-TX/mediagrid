import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Gallery from './Gallery.vue'
import { galleryStore } from '../stores/galleryStore'
import { playerStore } from '../stores/playerStore'
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

// One row per entry in `heights`, each with `tilesPerRow` tiles, tilei
// running sequentially across the whole set (matching the server's global
// ordering) — mirrors makeRows() in playerStore.test.ts but with variable
// row heights, needed to verify the offset-delta math precisely.
function makeRows(heights: number[], tilesPerRow: number): Row[] {
  const rows: Row[] = []
  let tilei = 0
  for (let r = 0; r < heights.length; r++) {
    const tiles: Tile[] = []
    for (let i = 0; i < tilesPerRow; i++) tiles.push(makeTile(tilei++))
    rows.push({ rowi: r, h: heights[r], tiles })
  }
  return rows
}

// GalleryRow (and its Tile children) render media/network-dependent markup
// that's irrelevant to Gallery's own scroll-sync logic, so it's stubbed out.
const mountGallery = () => mount(Gallery, { global: { stubs: { GalleryRow: true } } })

beforeEach(() => {
  galleryStore.state.rows = []
  galleryStore.state.totalRows = 0
  galleryStore.state.totalTiles = 0
  playerStore.state.open = false
  playerStore.state.currentIndex = 0
  playerStore.state.openMode = null
})

describe('Gallery scroll sync', () => {
  it('tap-open anchors on the current scrollTop, then shifts scrollTop by row-height deltas on swap', async () => {
    // Rows 0-4 are 100/200/300/400/500px tall, 2 tiles/row (indices 0-1, 2-3, 4-5, 6-7, 8-9).
    galleryStore.state.rows = makeRows([100, 200, 300, 400, 500], 2)
    const wrapper = mountGallery()
    ;(wrapper.vm.$el as HTMLElement).scrollTop = 800
    wrapper.find('.gallery').trigger('scroll')
    await nextTick()

    // Tapping a tile in row 3 (tilei 6) opens the Player; scrollTop (800) and
    // row 3 become the anchor.
    playerStore.open(6)
    await nextTick()
    expect((wrapper.vm.$el as HTMLElement).scrollTop).toBe(800)

    // Swap forward into row 4 (tilei 8): row 3 is 400px tall plus the 1px
    // gap after it, so scrollTop should grow by 401px.
    playerStore.state.currentIndex = 8
    await nextTick()
    expect((wrapper.vm.$el as HTMLElement).scrollTop).toBe(1201)

    // Swap back to row 3 (tilei 6): scrollTop should return to the anchor.
    playerStore.state.currentIndex = 6
    await nextTick()
    expect((wrapper.vm.$el as HTMLElement).scrollTop).toBe(800)

    wrapper.unmount()
  })

  it('a same-row swap leaves scrollTop unchanged', async () => {
    galleryStore.state.rows = makeRows([100, 200, 300], 2)
    const wrapper = mountGallery()
    playerStore.open(2) // row 1, tilei 2
    await nextTick()
    const before = (wrapper.vm.$el as HTMLElement).scrollTop

    playerStore.state.currentIndex = 3 // still row 1
    await nextTick()
    expect((wrapper.vm.$el as HTMLElement).scrollTop).toBe(before)

    wrapper.unmount()
  })

  it('clamps scrollTop to zero rather than going negative when swapping toward earlier rows', async () => {
    galleryStore.state.rows = makeRows([100, 200, 300], 2)
    const wrapper = mountGallery()
    ;(wrapper.vm.$el as HTMLElement).scrollTop = 50
    wrapper.find('.gallery').trigger('scroll')
    await nextTick()

    playerStore.open(4) // row 2, tilei 4, anchored at scrollTop 50
    await nextTick()

    playerStore.state.currentIndex = 0 // row 0: delta would be -300, i.e. negative
    await nextTick()
    expect((wrapper.vm.$el as HTMLElement).scrollTop).toBe(0)

    wrapper.unmount()
  })

  it('direct-load anchors the target row 100px below the viewport top once rows arrive', async () => {
    const wrapper = mountGallery()
    playerStore.openDirect(4) // will land in row 2 once rows load
    await nextTick()

    // Rows arrive asynchronously (mirroring resetWithTakei), after the
    // openMode watcher already ran with no rows loaded yet.
    galleryStore.state.rows = makeRows([100, 200, 300, 400], 2)
    await nextTick() // lets the rows-length watcher compute the target...
    await nextTick() // ...and the DOM grow to fit the new rows before it applies scrollTop

    // Row 2 starts at offset 100+200 = 300 (100px row gaps excluded here
    // since ROW_GAP=1 per row before it: 100+1 + 200+1 = 302).
    expect((wrapper.vm.$el as HTMLElement).scrollTop).toBe(302 - 100)

    wrapper.unmount()
  })

  it('direct-load clamps to zero when the target row is within 100px of the top', async () => {
    const wrapper = mountGallery()
    playerStore.openDirect(0) // row 0, offset 0
    await nextTick()
    galleryStore.state.rows = makeRows([100, 200], 2)
    await nextTick()
    await nextTick()

    expect((wrapper.vm.$el as HTMLElement).scrollTop).toBe(0)

    wrapper.unmount()
  })

  it('direct-load keeps loading more rows until there is enough content below the target row to scroll to it', async () => {
    const wrapper = mountGallery()
    const el = wrapper.vm.$el as HTMLElement
    // jsdom reports clientHeight as 0 by default; fake a real viewport size
    // and feed it through the same path a resize event would.
    Object.defineProperty(el, 'clientHeight', { value: 300, configurable: true })
    ;(wrapper.vm as unknown as { handleScroll: () => void }).handleScroll()

    // Initial load (mirroring resetWithTakei) covers tile 15 (row 7) but
    // nothing beyond it — not enough to fill a 300px viewport below row 7.
    playerStore.openDirect(15)
    await nextTick()
    galleryStore.state.rows = makeRows(Array(8).fill(100), 2) // rows 0-7, tiles 0-15
    galleryStore.state.totalRows = 20 // more rows exist on the server

    // loadMore() would normally hit the network; simulate it appending one
    // more row per call, like a real paginated fetch would.
    const loadMoreSpy = vi.spyOn(galleryStore, 'loadMore').mockImplementation(async () => {
      const nextRowi = galleryStore.state.rows.length
      galleryStore.state.rows.push(...makeRows([100], 2).map((r) => ({ ...r, rowi: nextRowi })))
    })

    await nextTick()
    await nextTick()
    await nextTick()

    // Row 7 offset = 7*(100+1) = 707; target = 707-100 = 607. Needs
    // totalHeight >= 607+300=907, which requires 1 extra row beyond the
    // initial 807px of content (8 rows * 101 - 1 gap... i.e. offsets[7]+100=807).
    expect(loadMoreSpy).toHaveBeenCalled()
    expect(el.scrollTop).toBe(607)

    wrapper.unmount()
  })

  it('closing and reopening the Player re-anchors on the new state', async () => {
    galleryStore.state.rows = makeRows([100, 200, 300], 2)
    const wrapper = mountGallery()

    playerStore.open(0) // row 0
    await nextTick()
    playerStore.state.currentIndex = 2 // swap into row 1 -> scrollTop grows by 101 (100 + gap)
    await nextTick()
    expect((wrapper.vm.$el as HTMLElement).scrollTop).toBe(101)

    playerStore.close()
    await nextTick()

    // Re-opening on a tile in row 2, from whatever scrollTop Gallery is now at.
    ;(wrapper.vm.$el as HTMLElement).scrollTop = 50
    wrapper.find('.gallery').trigger('scroll')
    await nextTick()
    playerStore.open(4) // row 2
    await nextTick()
    expect((wrapper.vm.$el as HTMLElement).scrollTop).toBe(50)

    wrapper.unmount()
  })
})
