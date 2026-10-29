// Which underlying source a Tile should currently render. 'thumbnail' covers
// both video-idle-state and non-video-with-thumbnail cases; 'original' is
// only used for an image with no thumbnail (load the original file).
export type TileSource = 'thumbnail' | 'sprite' | 'highlight' | 'original' | 'placeholder'

// Preview tiers for videos, lowest to highest.
export type VideoTier = 'thumbnail' | 'sprite' | 'highlight'

const TIERS_HIGH_TO_LOW: VideoTier[] = ['highlight', 'sprite', 'thumbnail']

export interface TilePlaybackInput {
  isVid: boolean
  hasThumbnail: boolean
  hasSprite: boolean
  hasHighlight: boolean
  videoTileInitial: VideoTier
  videoTileInteract: VideoTier
  hovering: boolean
}

// Resolves which preview source a gallery Tile should display:
//   - images: thumbnail if available, else the original.
//   - videos: the general setting (Initial at rest, Interact while hovering)
//     is the maximum tier; if that tier isn't available for the tile, fall
//     back to the next lower one, ending in a placeholder.
export function resolveTileSource(input: TilePlaybackInput): TileSource {
  if (!input.isVid) {
    return input.hasThumbnail ? 'thumbnail' : 'original'
  }

  const maxTier = input.hovering ? input.videoTileInteract : input.videoTileInitial
  const available: Record<VideoTier, boolean> = {
    highlight: input.hasHighlight,
    sprite: input.hasSprite,
    thumbnail: input.hasThumbnail,
  }
  for (const tier of TIERS_HIGH_TO_LOW.slice(TIERS_HIGH_TO_LOW.indexOf(maxTier))) {
    if (available[tier]) return tier
  }
  return 'placeholder'
}
