import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FileInfoModal from './FileInfoModal.vue'
import type { Tile as TileType } from '../types'
import { galleryStore } from '../stores/galleryStore'
import { toastStore } from '../stores/toastStore'
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
    duration: 65,
    filesize: 1536,
    mdate: Date.UTC(2024, 0, 15) / 1000,
    preview: { w: 1920, h: 1080, hasThumbnail: true, hasHighlight: false },
    ...overrides,
  }
}

function mountModal(tile: TileType) {
  return mount(FileInfoModal, { props: { tile } })
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(mediaApi.deleteMedia).mockReset()
  vi.mocked(mediaApi.renameMedia).mockReset()
})

describe('FileInfoModal display', () => {
  it('shows the full relative path (as a link to the raw file), date, filesize, resolution and duration for a video', () => {
    const tile = makeTile({ path: 'sub/dir/clip.mp4', duration: 65, filesize: 1536 })
    const wrapper = mountModal(tile)
    const text = wrapper.text()
    expect(text).toContain('sub/dir/clip.mp4')
    expect(text).toContain(new Date(tile.mdate * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
    expect(text).toContain('1.5 KB')
    expect(text).toContain('1920w x 1080h')
    expect(text).toContain('1:05')

    const link = wrapper.find('a')
    expect(link.text()).toBe('sub/dir/clip.mp4')
    expect(link.attributes('href')).toBe('/media/sub/dir/clip.mp4')
    expect(link.attributes('target')).toBe('_blank')
    wrapper.unmount()
  })

  it('omits the duration row for a non-video tile', () => {
    const wrapper = mountModal(makeTile({ isVid: false, path: 'sub/pic.jpg' }))
    expect(wrapper.text()).not.toContain('1:05')
    wrapper.unmount()
  })
})

describe('FileInfoModal close interactions', () => {
  it('closes on the close button, on overlay click, and on Escape', async () => {
    const wrapper = mountModal(makeTile())
    await wrapper.find('.close-btn').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    const wrapper2 = mountModal(makeTile())
    await wrapper2.find('.overlay').trigger('click')
    expect(wrapper2.emitted('close')).toHaveLength(1)

    const wrapper3 = mountModal(makeTile())
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper3.emitted('close')).toHaveLength(1)

    wrapper.unmount()
    wrapper2.unmount()
    wrapper3.unmount()
  })
})

describe('FileInfoModal rename', () => {
  it('re-prompts on an invalid name and on a backend conflict, then patches the shufflelist path, toasts, and closes', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('bad/name').mockReturnValueOnce('taken').mockReturnValueOnce('final')
    vi.mocked(mediaApi.renameMedia)
      .mockRejectedValueOnce(new Error('a file already exists at the new name'))
      .mockResolvedValueOnce(undefined)
    const renameTileSpy = vi.spyOn(galleryStore, 'renameTile').mockImplementation(() => {})
    const toastSpy = vi.spyOn(toastStore, 'show').mockImplementation(() => {})

    const wrapper = mountModal(makeTile({ tilei: 3, path: 'sub/clip.mp4' }))
    const renameBtn = wrapper.findAll('button').find((b) => b.text() === 'Rename')!
    await renameBtn.trigger('click')

    await vi.waitFor(() => expect(renameTileSpy).toHaveBeenCalled())

    expect(window.prompt).toHaveBeenCalledTimes(3)
    expect(mediaApi.renameMedia).toHaveBeenNthCalledWith(1, 'sub/clip.mp4', 'taken.mp4')
    expect(mediaApi.renameMedia).toHaveBeenNthCalledWith(2, 'sub/clip.mp4', 'final.mp4')
    expect(renameTileSpy).toHaveBeenCalledWith(3, 'sub/final.mp4')
    expect(toastSpy).toHaveBeenCalledWith('file renamed')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('stays open, untouched, and toast-free on a failed rename', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('taken').mockReturnValueOnce(null)
    vi.mocked(mediaApi.renameMedia).mockRejectedValueOnce(new Error('a file already exists at the new name'))
    const toastSpy = vi.spyOn(toastStore, 'show').mockImplementation(() => {})

    const wrapper = mountModal(makeTile({ path: 'sub/clip.mp4' }))
    const renameBtn = wrapper.findAll('button').find((b) => b.text() === 'Rename')!
    await renameBtn.trigger('click')

    await vi.waitFor(() => expect(window.prompt).toHaveBeenCalledTimes(2))
    expect(toastSpy).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('FileInfoModal delete', () => {
  it('does nothing if the confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mountModal(makeTile())
    const deleteBtn = wrapper.findAll('button').find((b) => b.text() === 'Delete')!
    await deleteBtn.trigger('click')
    expect(mediaApi.deleteMedia).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('alerts and stays open on a failed delete', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(mediaApi.deleteMedia).mockRejectedValueOnce(new Error('failed to delete file'))
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    const wrapper = mountModal(makeTile())
    const deleteBtn = wrapper.findAll('button').find((b) => b.text() === 'Delete')!
    await deleteBtn.trigger('click')

    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalledWith('failed to delete file'))
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('toasts, emits deleted and close on a successful delete', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(mediaApi.deleteMedia).mockResolvedValueOnce(undefined)
    const toastSpy = vi.spyOn(toastStore, 'show').mockImplementation(() => {})

    const wrapper = mountModal(makeTile())
    const deleteBtn = wrapper.findAll('button').find((b) => b.text() === 'Delete')!
    await deleteBtn.trigger('click')

    await vi.waitFor(() => expect(toastSpy).toHaveBeenCalledWith('file deleted'))
    expect(wrapper.emitted('deleted')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
