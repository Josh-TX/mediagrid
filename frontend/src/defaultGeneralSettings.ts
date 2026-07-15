import type { GeneralSettings } from './types'

export function makeDefaultGeneralSettings(): GeneralSettings {
  return {
    tilePct: 0.15,
    tileCropX: 0.1,
    tileCropY: 0.1,
    defaultSort: 'rand',
    tilePreviewAlways: false,
    fallbackToOriginal: true,

    autoplayInitiallyOn: true,
    playbackSpeed1: 2,
    playbackSpeed2: 4,
    playerCropX: 0,
    playerCropY: 0,
    rewindSeconds: 10,
    forwardSeconds: 10,
  }
}
