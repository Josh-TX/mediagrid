import type { Preset } from './types'
import type { ShuffleQuery } from './api/shuffle'

// Combines a Preset's Filter/Gallery settings with the toolbar's current
// sort/dir/filter-text (which override the preset's defaultSort without
// mutating the preset) into the query shape /api/shuffle expects.
export function buildShuffleQuery(
  preset: Preset,
  sortType: ShuffleQuery['sort'],
  sortDir: ShuffleQuery['dir'],
  filterText: string,
  screenW: number,
  screenH: number,
): ShuffleQuery {
  return {
    tilePct: preset.tilePct,
    screenW,
    screenH,
    f: filterText || undefined,
    sort: sortType,
    dir: sortDir,
    exVids: !preset.includeVids,
    exImgs: !preset.includeImages,
    exPort: !preset.includePortrait,
    exLand: !preset.includeLandscape,
    minDur: preset.minDuration || undefined,
    maxDur: preset.maxDuration || undefined,
    whitelist: preset.whitelistCSV || undefined,
    blacklist: preset.blacklistCSV || undefined,
    basepath: preset.basePath || undefined,
  }
}
