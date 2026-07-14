import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Tile from './Tile.vue'
import type { Tile as TileType } from '../types'
import { urlStore } from '../stores/urlStore'
import * as mediaApi from '../api/media'

vi.mock('../api/media', () => ({
  deleteMedia: vi.fn(),
  renameMedia: vi.fn(),
}))

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
    props: { tile, rowi: 0, rowH: 100, cropX: 0, cropY: 0, tilePreviewAlways: false, fallbackToOriginal: true },
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(mediaApi.deleteMedia).mockReset()
  vi.mocked(mediaApi.renameMedia).mockReset()
})

describe('Tile context menu', () => {
  it('opens on contextmenu (native event also fired by mobile long-press) and closes on outside click', async () => {
    const wrapper = mountTile(makeTile())
    await wrapper.find('.tile').trigger('contextmenu')
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['Open', 'Info'])

    await wrapper.find('.backdrop').trigger('click')
    expect(wrapper.findAll('button').length).toBe(0)
    wrapper.unmount()
  })

  it('Open triggers the same navigation as tapping the tile', async () => {
    const openSpy = vi.spyOn(urlStore, 'openTile').mockImplementation(() => {})
    const wrapper = mountTile(makeTile({ tilei: 7 }))
    await wrapper.find('.tile').trigger('contextmenu')
    await wrapper.findAll('button')[0].trigger('click')
    expect(openSpy).toHaveBeenCalledWith(7)
    wrapper.unmount()
  })

  it('Info opens the File Info modal for this tile, replacing the old menu', async () => {
    const wrapper = mountTile(makeTile({ path: 'sub/clip.mp4' }))
    await wrapper.find('.tile').trigger('contextmenu')
    await wrapper.findAll('button')[1].trigger('click')

    expect(wrapper.findAll('.backdrop').length).toBe(0) // context menu closed
    expect(wrapper.text()).toContain('sub/clip.mp4')
    wrapper.unmount()
  })

  // Regression check: a right-click landing on the modal (e.g. to use the
  // browser's native "open link"/"copy link" on the raw-file link) shouldn't
  // bubble up to the tile's own contextmenu handler and reopen this menu on
  // top of the modal.
  it('right-clicking inside the open File Info modal does not reopen the context menu', async () => {
    const wrapper = mountTile(makeTile({ path: 'sub/clip.mp4' }))
    await wrapper.find('.tile').trigger('contextmenu')
    await wrapper.findAll('button')[1].trigger('click') // Info

    await wrapper.find('.overlay').trigger('contextmenu')
    expect(wrapper.findAll('.backdrop').length).toBe(0)
    expect(wrapper.find('.overlay').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('Tile + File Info modal delete', () => {
  // Regression check for the wiring between the shared modal and this tile's
  // own cache-bust mechanism: a successful delete from the modal must still
  // force the tile's preview to re-fetch (bypassing cache) so the
  // "failed to load" state kicks in immediately, same as before this modal existed.
  it('bumps the cache-bust src param after a successful delete via the modal', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(mediaApi.deleteMedia).mockResolvedValueOnce(undefined)

    const wrapper = mountTile(makeTile({ isVid: false, path: 'sub/clip.jpg' }))
    await wrapper.find('.tile').trigger('contextmenu')
    await wrapper.findAll('button')[1].trigger('click') // Info

    const deleteBtn = wrapper.findAll('button').find((b) => b.text() === 'Delete')!
    await deleteBtn.trigger('click')
    await vi.waitFor(() => expect(mediaApi.deleteMedia).toHaveBeenCalled())
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
      },
    })
    await wrapper.find('video').trigger('error')
    expect(wrapper.text()).toContain('failed to load highlight')
    wrapper.unmount()
  })
})
