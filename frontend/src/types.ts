export type SortType = 'rand' | 'size' | 'az' | 'date' | 'dur'
export type SortDir = 'asc' | 'desc'
export type AutoPlayTile = 'off' | 'hover' | 'always'
export type OnVidEnd = 'loop' | 'stop' | 'next'

// One row in the `presets` table: the filter settings plus a unique name.
// Round-trips as-is through GET /api/settings (as part of `presets`) and
// POST /api/presets.
export interface Preset {
  name: string

  includeVids: boolean
  includeImages: boolean
  includePortrait: boolean
  includeLandscape: boolean
  minDuration: number
  maxDuration: number
  whitelistCSV: string
  blacklistCSV: string
  basePath: string
}

// The single global Gallery/Player settings object. Round-trips as-is
// through GET /api/settings (as `general`) and POST /api/general-settings.
export interface GeneralSettings {
  // Gallery settings
  tilePct: number
  tileCropX: number
  tileCropY: number
  defaultSort: SortType
  autoPlayTile: AutoPlayTile
  fallbackToOriginal: boolean

  // Player settings
  onVidEnd: OnVidEnd
  playerCropX: number
  playerCropY: number
  rewindSeconds: number
  forwardSeconds: number
}

export interface SettingsResponse {
  general: GeneralSettings
  presets: Preset[]
}

export interface PreviewData {
  w: number
  h: number
  hasThumbnail: boolean
  hasHighlight: boolean
}

export interface Tile {
  tilei: number
  w: number
  path: string
  isVid: boolean
  duration: number
  filesize: number
  mdate: number
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
