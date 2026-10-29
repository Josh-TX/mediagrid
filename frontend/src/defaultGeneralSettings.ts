import type { GeneralSettings } from './types'

export function makeDefaultGeneralSettings(): GeneralSettings {
  return {
    tilePct: 0.15,
    tileCropX: 0.1,
    tileCropY: 0.1,
    defaultSort: 'rand',
    videoTileInitial: 'thumbnail',
    videoTileInteract: 'highlight',
    spriteFps: 5,
    galleryTitleMode: 'parentTop',
    galleryTitleExt: false,

    autoplayInitiallyOn: true,
    playbackSpeed1: 2,
    playbackSpeed2: 4,
    playerCropX: 0,
    playerCropY: 0,
    rewindSeconds: 10,
    forwardSeconds: 10,
    playerTitleMode: 'parentTop',
    playerTitleExt: false,
  }
}
