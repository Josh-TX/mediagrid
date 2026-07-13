import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Tile from './Tile.vue'
import type { Tile as TileType } from '../types'
import { galleryStore } from '../stores/galleryStore'
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
    props: { tile, rowH: 100, cropX: 0, cropY: 0, autoPlayTile: 'off', fallbackToOriginal: true },
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
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['Open', 'Open Raw', 'Rename', 'Delete'])

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

  it('Open Raw opens the original media URL (not a thumbnail/highlight) in a new tab', async () => {
    const openWindowSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const wrapper = mountTile(makeTile({ path: 'sub/clip.mp4' }))
    await wrapper.find('.tile').trigger('contextmenu')
    await wrapper.findAll('button')[1].trigger('click')
    expect(openWindowSpy).toHaveBeenCalledWith('/media/sub/clip.mp4', '_blank', 'noopener,noreferrer')
    wrapper.unmount()
  })
})

describe('Tile rename', () => {
  it('re-prompts on an invalid name and on a backend conflict, then patches the shufflelist path on success', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('bad/name').mockReturnValueOnce('taken').mockReturnValueOnce('final')
    vi.mocked(mediaApi.renameMedia)
      .mockRejectedValueOnce(new Error('a file already exists at the new name'))
      .mockResolvedValueOnce(undefined)
    const renameTileSpy = vi.spyOn(galleryStore, 'renameTile').mockImplementation(() => {})

    const wrapper = mountTile(makeTile({ tilei: 3, path: 'sub/clip.mp4' }))
    await wrapper.find('.tile').trigger('contextmenu')
    await wrapper.findAll('button')[2].trigger('click')

    await vi.waitFor(() => expect(renameTileSpy).toHaveBeenCalled())

    expect(window.prompt).toHaveBeenCalledTimes(3)
    expect(mediaApi.renameMedia).toHaveBeenNthCalledWith(1, 'sub/clip.mp4', 'taken.mp4')
    expect(mediaApi.renameMedia).toHaveBeenNthCalledWith(2, 'sub/clip.mp4', 'final.mp4')
    expect(renameTileSpy).toHaveBeenCalledWith(3, 'sub/final.mp4')
    wrapper.unmount()
  })

  it('rejects a name containing a slash before ever calling the backend', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('nested/name').mockReturnValueOnce(null)
    const wrapper = mountTile(makeTile({ path: 'clip.mp4' }))
    await wrapper.find('.tile').trigger('contextmenu')
    await wrapper.findAll('button')[2].trigger('click')

    await vi.waitFor(() => expect(window.prompt).toHaveBeenCalledTimes(2))
    expect(mediaApi.renameMedia).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('treats submitting the unchanged (trimmed) name as a silent no-op', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('  clip  ')
    const wrapper = mountTile(makeTile({ path: 'sub/clip.mp4' }))
    await wrapper.find('.tile').trigger('contextmenu')
    await wrapper.findAll('button')[2].trigger('click')
    await Promise.resolve()

    expect(mediaApi.renameMedia).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('Tile delete', () => {
  it('does nothing if the confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mountTile(makeTile())
    await wrapper.find('.tile').trigger('contextmenu')
    await wrapper.findAll('button')[3].trigger('click')
    expect(mediaApi.deleteMedia).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('alerts on a failed delete rather than mutating anything', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(mediaApi.deleteMedia).mockRejectedValueOnce(new Error('failed to delete file'))
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    const wrapper = mountTile(makeTile())
    await wrapper.find('.tile').trigger('contextmenu')
    await wrapper.findAll('button')[3].trigger('click')

    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalledWith('failed to delete file'))
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
        rowH: 100,
        cropX: 0,
        cropY: 0,
        autoPlayTile: 'always',
        fallbackToOriginal: true,
      },
    })
    await wrapper.find('video').trigger('error')
    expect(wrapper.text()).toContain('failed to load highlight')
    wrapper.unmount()
  })
})
