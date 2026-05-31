import { Schema } from "@effect/schema"

export const Preset = Schema.Struct({
  name: Schema.String,
  targetTilePercent: Schema.Int,
  maxTilePercent: Schema.Int,
  clusterCount: Schema.Int,
  minAspectRatio: Schema.NullOr(Schema.Number),
  maxAspectRatio: Schema.NullOr(Schema.Number),
  minDuration: Schema.NullOr(Schema.Int),
  maxDuration: Schema.NullOr(Schema.Int),
  playerCropMaxX: Schema.Number,
  playerCropMaxY: Schema.Number,
  tileCropMaxX: Schema.Number,
  tileCropMaxY: Schema.Number,
  excludeContainsCsv: Schema.NullOr(Schema.String),
  excludeNotContainsCsv: Schema.NullOr(Schema.String),
  mediaType: Schema.Literal("all", "images", "videos"),
  forwardPreloadCount: Schema.Int,
  backwardPreloadCount: Schema.Int,
  oneFileAtATime: Schema.Boolean,
  rewindSeconds: Schema.Int,
  fastForwardSeconds: Schema.Int,
  showTileTitle: Schema.Boolean,
  videoEndBehavior: Schema.Literal("loop", "stop", "next"),
  defaultSort: Schema.Literal("random", "size", "az", "date"),
})
export type Preset = typeof Preset.Type

export const PreviewInfo = Schema.Struct({
  path: Schema.String,
  width: Schema.Int,
  height: Schema.Int,
  filesize: Schema.Int,
  mdate: Schema.Int,
  duration: Schema.NullOr(Schema.Int),
  media_type: Schema.Int,
  previewType: Schema.Literal("original", "thumbnail", "highlight", "placeholder"),
})
export type PreviewInfo = typeof PreviewInfo.Type

export const TileInfo = Schema.Struct({
  index: Schema.Int,
  width: Schema.Number,
  preview: PreviewInfo,
})
export type TileInfo = typeof TileInfo.Type

export const BlockInfo = Schema.Struct({
  index: Schema.Int,
  tiles: Schema.Array(TileInfo),
})
export type BlockInfo = typeof BlockInfo.Type

export const BlockResponse = Schema.Struct({
  shuffleId: Schema.Int,
  totalBlocks: Schema.Int,
  totalMedia: Schema.Int,
  blocks: Schema.Array(BlockInfo),
})
export type BlockResponse = typeof BlockResponse.Type

export const ActiveTask = Schema.Struct({
  id: Schema.Int,
  type: Schema.Literal("scan", "clean", "gen-thumbnails", "gen-highlights"),
  status: Schema.String,
  startedAt: Schema.Number,
  cancelling: Schema.Boolean,
})
export type ActiveTask = typeof ActiveTask.Type

export const QueuedTask = Schema.Struct({
  id: Schema.Int,
  type: Schema.Literal("scan", "clean", "gen-thumbnails", "gen-highlights"),
  enqueuedAt: Schema.Number,
})
export type QueuedTask = typeof QueuedTask.Type

export const RecentTask = Schema.Struct({
  id: Schema.Int,
  type: Schema.Literal("scan", "clean", "gen-thumbnails", "gen-highlights"),
  outcome: Schema.Literal("completed", "cancelled", "failed"),
  message: Schema.String,
  finishedAt: Schema.Number,
  duration: Schema.Number,
})
export type RecentTask = typeof RecentTask.Type

export const PreviewSettings = Schema.Struct({
  thumbCompression: Schema.Int,
  thumbResolution: Schema.Int,
  highlightResolution: Schema.Int,
  highlightDuration: Schema.Number,
  highlightSegmentCount: Schema.Int,
  highlightFfmpegArg: Schema.String,
})
export type PreviewSettings = typeof PreviewSettings.Type

export const TasksResponse = Schema.Struct({
  active: Schema.NullOr(ActiveTask),
  queue: Schema.Array(QueuedTask),
  recent: Schema.Array(RecentTask),
})
export type TasksResponse = typeof TasksResponse.Type

export const MediaInfo = Schema.Struct({
  path: Schema.String,
  width: Schema.Int,
  height: Schema.Int,
  duration: Schema.NullOr(Schema.Int),
  media_type: Schema.Int,
  filesize: Schema.Int,
  mdate: Schema.Int,
})
export type MediaInfo = typeof MediaInfo.Type
