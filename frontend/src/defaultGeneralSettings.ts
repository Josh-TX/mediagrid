import type { GeneralSettings } from './types'

export function makeDefaultGeneralSettings(): GeneralSettings {
  return {
    tilePct: 0.15,
    tileCropX: 0.1,
    tileCropY: 0.1,
    defaultSort: 'rand',
    autoPlayTile: 'off',
    fallbackToOriginal: true,

    onVidEnd: 'next',
    playerCropX: 0.2,
    playerCropY: 0.2,
    rewindSeconds: 10,
    forwardSeconds: 10,
  }
}
