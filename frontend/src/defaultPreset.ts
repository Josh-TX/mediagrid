import type { Preset } from './types'

export function makeDefaultPreset(name: string): Preset {
  return {
    name,

    tilePct: 0.15,
    tileCropX: 0.1,
    tileCropY: 0.1,
    defaultSort: 'rand',
    autoPlayTile: 'off',
    fallbackToOriginal: true,

    includeVids: true,
    includeImages: true,
    includePortrait: true,
    includeLandscape: true,
    minDuration: 0,
    maxDuration: 0,
    whitelistCSV: '',
    blacklistCSV: '',
    basePath: '',

    onVidEnd: 'next',
    playerCropX: 0.2,
    playerCropY: 0.2,
    rewindSeconds: 10,
    forwardSeconds: 10,
  }
}
