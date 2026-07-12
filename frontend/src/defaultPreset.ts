import type { Preset } from './types'

export function makeDefaultPreset(name: string): Preset {
  return {
    name,

    includeVids: true,
    includeImages: true,
    includePortrait: true,
    includeLandscape: true,
    minDuration: 0,
    maxDuration: 0,
    whitelistCSV: '',
    blacklistCSV: '',
    basePath: '',
  }
}
