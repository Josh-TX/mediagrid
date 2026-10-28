import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Tile from './Tile.vue'
import type { Tile as TileType } from '../types'
import { urlStore } from '../stores/urlStore'
import { selectionStore } from '../stores/selectionStore'

function makeTile(overrides: Partial<TileType> = {}): TileType {
  return {
    tilei: 0,
    w: 100,
    path: 'sub/clip.mp4',
    isVid: true,
    duration: 10,
    filesize: 1000,
    mdate: 0,
    preview: { w: 100, h: 100, hasThumbnail: true, hasHighlight: false },
    ...overrides,
  }
}

function mountTile(tile: TileType) {
  return mount(Tile, {
    props: { tile, rowi: 0, rowH: 100, cropX: 0, cropY: 0, tilePreviewAlways: false, fallbackToOriginal: true, titleMode: 'parentTop', titleExt: false },
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Tile multi-select', () => {
  beforeEach(() => selectionStore.clear())

  it('contextmenu enters multi-select with the tile selected (no menu), and the following click does not toggle it off', async () => {
    const openSpy = vi.spyOn(urlStore, 'openTile').mockImplementation(() => {})
    const wrapper = mountTile(makeTile({ tilei: 3 }))
    await wrapper.find('.tile').trigger('contextmenu')
    expect(selectionStore.isSelected(3)).toBe(true)
    expect(wrapper.find('.select-border').exists()).toBe(true)
    expect(wrapper.find('.select-check.on').exists()).toBe(true)

    await wrapper.find('.tile').trigger('click')
    expect(selectionStore.isSelected(3)).toBe(true)
    expect(openSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('right-clicking while selecting toggles the tile', async () => {
    selectionStore.enter(makeTile({ tilei: 1 }))
    const wrapper = mountTile(makeTile({ tilei: 2 }))
    await wrapper.find('.tile').trigger('contextmenu')
    expect(selectionStore.isSelected(2)).toBe(true)
    await wrapper.find('.tile').trigger('contextmenu')
    expect(selectionStore.isSelected(2)).toBe(false)
    wrapper.unmount()
  })

  it('clicking while selecting toggles the tile instead of opening the player; deselecting the last exits', async () => {
    const openSpy = vi.spyOn(urlStore, 'openTile').mockImplementation(() => {})
    selectionStore.enter(makeTile({ tilei: 1 }))
    const wrapper = mountTile(makeTile({ tilei: 2 }))
    await wrapper.find('.tile').trigger('click')
    expect(selectionStore.isSelected(2)).toBe(true)
    await wrapper.find('.tile').trigger('click')
    expect(selectionStore.isSelected(2)).toBe(false)
    expect(openSpy).not.toHaveBeenCalled()

    selectionStore.toggle(makeTile({ tilei: 1 }))
    expect(selectionStore.isActive()).toBe(false)
    wrapper.unmount()
  })

  it('clicking when not selecting opens the player', async () => {
    const openSpy = vi.spyOn(urlStore, 'openTile').mockImplementation(() => {})
    const wrapper = mountTile(makeTile({ tilei: 7 }))
    await wrapper.find('.tile').trigger('click')
    expect(openSpy).toHaveBeenCalledWith(7)
    wrapper.unmount()
  })

  it('a long touch press enters multi-select', async () => {
    vi.useFakeTimers()
    const wrapper = mountTile(makeTile({ tilei: 4 }))
    await wrapper.find('.tile').trigger('touchstart')
    vi.advanceTimersByTime(600)
    expect(selectionStore.isSelected(4)).toBe(true)
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('a short touch (or a move) does not enter multi-select', async () => {
    vi.useFakeTimers()
    const wrapper = mountTile(makeTile({ tilei: 4 }))
    await wrapper.find('.tile').trigger('touchstart')
    await wrapper.find('.tile').trigger('touchmove')
    vi.advanceTimersByTime(600)
    expect(selectionStore.isActive()).toBe(false)
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('bumps the cache-bust src param after a bulk delete', async () => {
    const wrapper = mountTile(makeTile({ tilei: 5, isVid: false, path: 'sub/clip.jpg' }))
    selectionStore.bustTile(5)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('img').attributes('src')).toContain('_=1')
    wrapper.unmount()
  })
})

describe('Tile failed-load message', () => {
  // A video tile with a stale hasThumbnail=true flag (e.g. deleted through
  // the app, or a "//deleted" sentinel) still attempts the thumbnail load;
  // when it 404s, the message names what was actually attempted.
  it('shows "failed to load thumbnail" when the thumbnail image errors', async () => {
    const wrapper = mountTile(
      makeTile({ isVid: false, preview: { w: 100, h: 100, hasThumbnail: true, hasHighlight: false } }),
    )
    await wrapper.find('img').trigger('error')
    expect(wrapper.text()).toContain('failed to load thumbnail')
    wrapper.unmount()
  })

  it('shows "failed to load image" when a plain image (no thumbnail) errors', async () => {
    const wrapper = mountTile(
      makeTile({ isVid: false, preview: { w: 100, h: 100, hasThumbnail: false, hasHighlight: false } }),
    )
    await wrapper.find('img').trigger('error')
    expect(wrapper.text()).toContain('failed to load image')
    wrapper.unmount()
  })

  it('shows "failed to load highlight" when a playing video with a highlight errors', async () => {
    const wrapper = mount(Tile, {
      props: {
        tile: makeTile({ isVid: true, preview: { w: 100, h: 100, hasThumbnail: false, hasHighlight: true } }),
        rowi: 0,
        rowH: 100,
        cropX: 0,
        cropY: 0,
        tilePreviewAlways: true,
        fallbackToOriginal: true,
        titleMode: 'parentTop',
        titleExt: false,
      },
    })
    await wrapper.find('video').trigger('error')
    expect(wrapper.text()).toContain('failed to load highlight')
    wrapper.unmount()
  })
})
