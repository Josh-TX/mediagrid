import type { AutoPlayTile } from './types'

// Which underlying source a Tile should currently render. 'thumbnail' covers
// both video-idle-state and non-video-with-thumbnail cases; 'original' is
// used both for a plain image fallback (no thumbnail) and a playing video
// fallback (no highlight, fallbackToOriginal=true) — the src differs, but
// both mean "load the original media file".
export type TileSource = 'thumbnail' | 'original' | 'highlight' | 'placeholder'

export interface TilePlaybackInput {
  isVid: boolean
  hasThumbnail: boolean
  hasHighlight: boolean
  autoPlayTile: AutoPlayTile
  fallbackToOriginal: boolean
  hovering: boolean
}

// Resolves which preview source a gallery Tile should display, per the
// image/video decision tree:
//   - images: thumbnail if available, else the original.
//   - videos with playback off, or hover-mode while idle: thumbnail if
//     available, else a placeholder (never the original — that'd defeat the
//     point of thumbnails existing).
//   - videos with playback active (autoPlayTile=always, or hovering while
//     autoPlayTile=hover): highlight if available; else the original if
//     fallbackToOriginal; else fall back to the idle state (thumbnail/placeholder).
export function resolveTileSource(input: TilePlaybackInput): TileSource {
  if (!input.isVid) {
    return input.hasThumbnail ? 'thumbnail' : 'original'
  }

  const playbackActive = input.autoPlayTile === 'always' || (input.autoPlayTile === 'hover' && input.hovering)
  if (playbackActive) {
    if (input.hasHighlight) return 'highlight'
    if (input.fallbackToOriginal) return 'original'
  }

  return input.hasThumbnail ? 'thumbnail' : 'placeholder'
}
