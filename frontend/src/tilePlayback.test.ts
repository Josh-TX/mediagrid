import { describe, it, expect } from 'vitest'
import { resolveTileSource, type TilePlaybackInput } from './tilePlayback'

function input(overrides: Partial<TilePlaybackInput> = {}): TilePlaybackInput {
  return {
    isVid: true,
    hasThumbnail: false,
    hasSprite: false,
    hasHighlight: false,
    videoTileInitial: 'thumbnail',
    videoTileInteract: 'highlight',
    hovering: false,
    ...overrides,
  }
}

describe('resolveTileSource: images', () => {
  it('uses the thumbnail when available', () => {
    expect(resolveTileSource(input({ isVid: false, hasThumbnail: true }))).toBe('thumbnail')
  })

  it('falls back to the original with no thumbnail', () => {
    expect(resolveTileSource(input({ isVid: false, hasThumbnail: false }))).toBe('original')
  })

  it('ignores sprite/highlight and the tier settings entirely', () => {
    expect(
      resolveTileSource(
        input({ isVid: false, hasThumbnail: true, hasSprite: true, hasHighlight: true, videoTileInitial: 'highlight' }),
      ),
    ).toBe('thumbnail')
  })
})

describe('resolveTileSource: videos', () => {
  const all = { hasThumbnail: true, hasSprite: true, hasHighlight: true }

  it('at rest uses the Initial tier', () => {
    expect(resolveTileSource(input({ ...all, videoTileInitial: 'thumbnail' }))).toBe('thumbnail')
    expect(resolveTileSource(input({ ...all, videoTileInitial: 'sprite' }))).toBe('sprite')
    expect(resolveTileSource(input({ ...all, videoTileInitial: 'highlight' }))).toBe('highlight')
  })

  it('while hovering uses the Interact tier', () => {
    expect(resolveTileSource(input({ ...all, hovering: true, videoTileInteract: 'sprite' }))).toBe('sprite')
    expect(resolveTileSource(input({ ...all, hovering: true, videoTileInteract: 'highlight' }))).toBe('highlight')
  })

  it('falls back to the next lower tier when the max tier is unavailable', () => {
    expect(resolveTileSource(input({ hasThumbnail: true, hasSprite: true, hovering: true }))).toBe('sprite')
    expect(resolveTileSource(input({ hasThumbnail: true, hovering: true }))).toBe('thumbnail')
    expect(resolveTileSource(input({ hasThumbnail: true, videoTileInitial: 'sprite' }))).toBe('thumbnail')
  })

  it('never goes above the max tier', () => {
    expect(resolveTileSource(input({ ...all, videoTileInitial: 'thumbnail' }))).toBe('thumbnail')
    expect(resolveTileSource(input({ ...all, hovering: true, videoTileInteract: 'sprite' }))).toBe('sprite')
  })

  it('shows a placeholder when no tier at or below the max is available', () => {
    expect(resolveTileSource(input({ hasHighlight: true }))).toBe('placeholder')
    expect(resolveTileSource(input({ hasHighlight: true, hovering: true, videoTileInteract: 'sprite' }))).toBe(
      'placeholder',
    )
  })
})
