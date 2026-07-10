export type SortType = 'rand' | 'size' | 'az' | 'date'
export type SortDir = 'asc' | 'desc'
export type AutoPlayTile = 'off' | 'hover' | 'always'
export type OnVidEnd = 'loop' | 'stop' | 'next'

// One row in the `presets` table: every Gallery/Filter/Player setting plus a
// unique name. Round-trips as-is through GET/POST /api/presets.
export interface Preset {
  name: string

  // Gallery settings
  tilePct: number
  tileCropX: number
  tileCropY: number
  defaultSort: SortType
  autoPlayTile: AutoPlayTile
  fallbackToOriginal: boolean

  // Filter settings
  includeVids: boolean
  includeImages: boolean
  includePortrait: boolean
  includeLandscape: boolean
  minDuration: number
  maxDuration: number
  whitelistCSV: string
  blacklistCSV: string
  basePath: string

  // Player settings (stored only; the Player itself is out of scope)
  onVidEnd: OnVidEnd
  playerCropX: number
  playerCropY: number
  rewindSeconds: number
  forwardSeconds: number
}

export interface PreviewData {
  path: string
  w: number
  h: number
  filesize: number
  mdate: number
  duration: number
  isVid: boolean
}

export interface Tile {
  tilei: number
  w: number
  path: string
  isVid: boolean
  preview: PreviewData
}

export interface Row {
  rowi: number
  h: number
  tiles: Tile[]
}

export interface ShuffleResult {
  totalRows: number
  totalTiles: number
  rows: Row[]
}
