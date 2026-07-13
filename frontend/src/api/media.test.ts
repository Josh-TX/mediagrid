import { describe, it, expect, afterEach, vi } from 'vitest'
import { deleteMedia, renameMedia } from './media'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deleteMedia', () => {
  it('DELETEs the URL-encoded /api/delete/<path>', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetchSpy)

    await deleteMedia('vacation/beach photo #1.jpg')

    expect(fetchSpy).toHaveBeenCalledWith('/api/delete/vacation/beach%20photo%20%231.jpg', { method: 'DELETE' })
  })

  it('throws with the backend response body on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => 'failed to delete file' })),
    )

    await expect(deleteMedia('a.jpg')).rejects.toThrow('failed to delete file')
  })
})

describe('renameMedia', () => {
  it('PUTs a JSON {newName} body to /api/rename/<path>', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetchSpy)

    await renameMedia('sub/clip.mp4', 'renamed.mp4')

    expect(fetchSpy).toHaveBeenCalledWith('/api/rename/sub/clip.mp4', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName: 'renamed.mp4' }),
    })
  })

  // The rename flow re-prompts on conflict, showing the backend's own error
  // text (e.g. "a file already exists at the new name") to the user.
  it('throws with the backend response body on a name conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 409, text: async () => 'a file already exists at the new name' })),
    )

    await expect(renameMedia('a.jpg', 'b.jpg')).rejects.toThrow('a file already exists at the new name')
  })
})
