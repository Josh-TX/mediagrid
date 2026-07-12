import { describe, it, expect } from 'vitest'
import { resolveTileSource, type TilePlaybackInput } from './tilePlayback'

function input(overrides: Partial<TilePlaybackInput>): TilePlaybackInput {
  return {
    isVid: true,
    hasThumbnail: false,
    hasHighlight: false,
    autoPlayTile: 'off',
    fallbackToOriginal: true,
    hovering: false,
    ...overrides,
  }
}

describe('resolveTileSource: images', () => {
  it('loads the thumbnail when one exists', () => {
    expect(resolveTileSource(input({ isVid: false, hasThumbnail: true }))).toBe('thumbnail')
  })

  it('falls back to the original when no thumbnail exists', () => {
    expect(resolveTileSource(input({ isVid: false, hasThumbnail: false }))).toBe('original')
  })

  it('ignores hasHighlight/autoPlayTile entirely for images', () => {
    expect(resolveTileSource(input({ isVid: false, hasThumbnail: true, hasHighlight: true, autoPlayTile: 'always' }))).toBe(
      'thumbnail',
    )
  })
})

describe('resolveTileSource: videos, playback off', () => {
  it('shows the thumbnail when available', () => {
    expect(resolveTileSource(input({ autoPlayTile: 'off', hasThumbnail: true, hasHighlight: true }))).toBe('thumbnail')
  })

  it('shows a placeholder with no thumbnail, even with a highlight available', () => {
    expect(resolveTileSource(input({ autoPlayTile: 'off', hasThumbnail: false, hasHighlight: true }))).toBe('placeholder')
  })
})

describe('resolveTileSource: videos, hover mode', () => {
  it('idle (not hovering) behaves like "off": thumbnail or placeholder, never plays', () => {
    expect(resolveTileSource(input({ autoPlayTile: 'hover', hovering: false, hasThumbnail: true, hasHighlight: true }))).toBe(
      'thumbnail',
    )
    expect(resolveTileSource(input({ autoPlayTile: 'hover', hovering: false, hasThumbnail: false, hasHighlight: true }))).toBe(
      'placeholder',
    )
  })

  it('hovering plays the highlight when one exists', () => {
    expect(resolveTileSource(input({ autoPlayTile: 'hover', hovering: true, hasHighlight: true }))).toBe('highlight')
  })

  it('hovering with no highlight plays the original when fallbackToOriginal is true', () => {
    expect(
      resolveTileSource(input({ autoPlayTile: 'hover', hovering: true, hasHighlight: false, fallbackToOriginal: true })),
    ).toBe('original')
  })

  it('hovering with no highlight and fallbackToOriginal false stays on the idle thumbnail', () => {
    expect(
      resolveTileSource(
        input({ autoPlayTile: 'hover', hovering: true, hasHighlight: false, fallbackToOriginal: false, hasThumbnail: true }),
      ),
    ).toBe('thumbnail')
  })

  it('hovering with no highlight, no fallback, and no thumbnail shows the placeholder', () => {
    expect(
      resolveTileSource(
        input({ autoPlayTile: 'hover', hovering: true, hasHighlight: false, fallbackToOriginal: false, hasThumbnail: false }),
      ),
    ).toBe('placeholder')
  })
})

describe('resolveTileSource: videos, always mode', () => {
  it('plays the highlight when one exists', () => {
    expect(resolveTileSource(input({ autoPlayTile: 'always', hasHighlight: true }))).toBe('highlight')
  })

  it('plays the original when no highlight and fallbackToOriginal is true', () => {
    expect(resolveTileSource(input({ autoPlayTile: 'always', hasHighlight: false, fallbackToOriginal: true }))).toBe(
      'original',
    )
  })

  it('shows the thumbnail when no highlight and fallbackToOriginal is false', () => {
    expect(
      resolveTileSource(
        input({ autoPlayTile: 'always', hasHighlight: false, fallbackToOriginal: false, hasThumbnail: true }),
      ),
    ).toBe('thumbnail')
  })

  it('shows the placeholder when no highlight, no fallback, and no thumbnail', () => {
    expect(
      resolveTileSource(
        input({ autoPlayTile: 'always', hasHighlight: false, fallbackToOriginal: false, hasThumbnail: false }),
      ),
    ).toBe('placeholder')
  })
})
