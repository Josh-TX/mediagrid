import { describe, it, expect, beforeEach, vi } from 'vitest'
import { autoRename, bulkMove, isFileConflict } from './bulkOps'
import { HttpError } from './api/media'
import * as mediaApi from './api/media'
import type { Tile } from './types'

vi.mock('./api/media', async (orig) => ({
  ...(await orig<typeof import('./api/media')>()),
  moveMedia: vi.fn(),
  deleteMedia: vi.fn(),
  listDir: vi.fn(),
}))

const tile = (i: number, path: string): Tile => ({
  tilei: i, w: 1, path, isVid: false, duration: 0, filesize: 0, mdate: 0,
  preview: { w: 1, h: 1, hasThumbnail: false, hasHighlight: false },
})
const conflict = () => new HttpError('a file already exists at the destination', 409)

beforeEach(() => {
  vi.mocked(mediaApi.moveMedia).mockReset()
  vi.mocked(mediaApi.listDir).mockResolvedValue({ path: '/d', exists: true, entries: [{ name: 'a.jpg', isDir: false }] })
})

describe('autoRename', () => {
  it('suffixes before the extension and skips taken names', () => {
    expect(autoRename('a.jpg', new Set(['a.jpg', 'a (1).jpg']))).toBe('a (2).jpg')
  })
})

describe('isFileConflict', () => {
  it('is false for a folder conflict', () => {
    expect(isFileConflict(new HttpError('a folder with that name exists at the destination', 409))).toBe(false)
    expect(isFileConflict(conflict())).toBe(true)
  })
})

describe('bulkMove', () => {
  it('skips files already in the destination', async () => {
    const s = await bulkMove([tile(0, 'd/a.jpg')], '/d', false, vi.fn())
    expect(mediaApi.moveMedia).not.toHaveBeenCalled()
    expect(s.skipped).toBe(1)
  })

  it('applies "skip" to all remaining conflicts after one prompt', async () => {
    vi.mocked(mediaApi.moveMedia).mockRejectedValue(conflict())
    const resolve = vi.fn().mockResolvedValue({ action: 'skip', applyAll: true })
    const s = await bulkMove([tile(0, 's/a.jpg'), tile(1, 's/b.jpg')], '/d', true, resolve)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(s.skipped).toBe(2)
  })

  it('override retries with overwrite', async () => {
    vi.mocked(mediaApi.moveMedia).mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ path: 'd/a.jpg', inLibrary: true })
    const s = await bulkMove([tile(0, 's/a.jpg')], '/d', true, async () => ({ action: 'override', applyAll: false }))
    expect(vi.mocked(mediaApi.moveMedia).mock.calls[1][3]).toBe(true)
    expect(s.copied).toBe(1)
  })

  it('auto-rename picks a free name; custom rename re-prompts on a repeat conflict', async () => {
    vi.mocked(mediaApi.moveMedia)
      .mockRejectedValueOnce(conflict())
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({ path: 'd/z.jpg', inLibrary: true })
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({ action: 'rename', applyAll: false })
      .mockResolvedValueOnce({ action: 'custom', newName: 'z.jpg', applyAll: false })
    const s = await bulkMove([tile(0, 's/a.jpg')], '/d', true, resolve)
    const calls = vi.mocked(mediaApi.moveMedia).mock.calls
    expect(calls[1][2]).toBe('a (1).jpg')
    expect(resolve.mock.calls[1][0].retry).toBe(false)
    expect(calls[2][2]).toBe('z.jpg')
    expect(s.copied).toBe(1)
  })

  it('counts non-conflict errors as failed and continues', async () => {
    vi.mocked(mediaApi.moveMedia).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ path: 'd/b.jpg', inLibrary: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = await bulkMove([tile(0, 's/a.jpg'), tile(1, 's/b.jpg')], '/d', false, vi.fn())
    expect(s).toMatchObject({ failed: 1, moved: 1 })
  })
})
