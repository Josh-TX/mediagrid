import { describe, it, expect } from 'vitest'
import { mediaUrl } from './shuffle'

describe('mediaUrl', () => {
  it('URL-encodes each path segment since filenames can contain unusual characters', () => {
    expect(mediaUrl('vacation/beach photo #1.jpg')).toBe('/media/vacation/beach%20photo%20%231.jpg')
  })

  it('preserves the directory structure (slashes are not encoded)', () => {
    expect(mediaUrl('a/b/c.png')).toBe('/media/a/b/c.png')
  })
})
