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

export type TaskType = 'scan' | 'scan_clean' | 'gen_thumbnails' | 'gen_highlights'
export type TaskStatus = 'queued' | 'active' | 'completed' | 'cancelled'

// One task snapshot as returned by GET /api/tasks. startedAt/finishedAt are
// absent until the task reaches that stage.
export interface TaskInfo {
  id: string
  type: TaskType
  name: string
  status: TaskStatus
  processed: number
  total: number
  failed: number
  queuedAt: number
  startedAt?: number
  finishedAt?: number
}

export interface TasksResponse {
  active: TaskInfo | null
  queue: TaskInfo[]
  recent: TaskInfo[]
}

export interface ThumbnailSettings {
  quality: number
  targetPixels: number
  override: boolean
  filter: string
  usePresetFilter: boolean
  presetName: string
}

export interface HighlightSettings {
  targetPixels: number
  override: boolean
  segmentCount: number
  segmentDuration: number
  maxProportion: number
  ffmpegArgs: string
  filter: string
  usePresetFilter: boolean
  presetName: string
}

export interface GenSettingsResponse {
  thumbnail: ThumbnailSettings
  highlight: HighlightSettings
}
