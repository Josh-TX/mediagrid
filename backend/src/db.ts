import { Context, Effect, Layer } from "effect"
import { Database as BunDB } from "bun:sqlite"
import type { Preset, PreviewSettings } from "@repo/types"

/** Backend-only type matching the DB media schema. No previewType. */
export interface MediaRecord {
  path: string
  width: number
  height: number
  filesize: number
  mdate: number
  duration: number | null
  media_type: number
}

export class Database extends Context.Tag("Database")<
  Database,
  {
    /** INSERT OR IGNORE — returns true if the row was newly inserted */
    readonly insertMedia: (entry: MediaRecord) => Effect.Effect<boolean>
    readonly getAllMedia: () => Effect.Effect<MediaRecord[]>
    readonly deleteMedia: (path: string) => Effect.Effect<void>
    readonly getPresets: () => Effect.Effect<Preset[]>
    readonly putPresets: (presets: Preset[]) => Effect.Effect<void>
    readonly getPresetByName: (name: string) => Effect.Effect<Preset | null>
    readonly getPreviewSettings: () => Effect.Effect<PreviewSettings | null>
    readonly upsertPreviewSettings: (settings: PreviewSettings) => Effect.Effect<void>
  }
>() {}

const DATA_DIR = process.env["DATA_DIR"] ?? "/data"
const DB_PATH = `${DATA_DIR}/mediagrid.db`

export const DEFAULT_PRESET: Preset = {
  name: "default",
  targetTilePercent: 25,
  maxTilePercent: 50,
  clusterCount: 3,
  minAspectRatio: null,
  maxAspectRatio: null,
  minDuration: null,
  maxDuration: null,
  playerCropMaxX: 0.1,
  playerCropMaxY: 0.1,
  tileCropMaxX: 0.1,
  tileCropMaxY: 0.1,
  excludeContainsCsv: null,
  excludeNotContainsCsv: null,
  mediaType: "all",
  forwardPreloadCount: 1,
  backwardPreloadCount: 1,
  oneFileAtATime: false,
  rewindSeconds: 10,
  fastForwardSeconds: 10,
  showTileTitle: true,
}

export const DatabaseLive = Layer.sync(Database, () => {
  const db = new BunDB(DB_PATH, { create: true })
  db.run(`
    CREATE TABLE IF NOT EXISTS media (
      path TEXT PRIMARY KEY,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      filesize INTEGER NOT NULL,
      mdate INTEGER NOT NULL,
      duration INTEGER,
      media_type INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS preset (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      targetTilePercent INTEGER NOT NULL,
      maxTilePercent INTEGER NOT NULL,
      clusterCount INTEGER NOT NULL,
      minAspectRatio REAL,
      maxAspectRatio REAL,
      minDuration INTEGER,
      maxDuration INTEGER,
      playerCropMaxX REAL NOT NULL,
      playerCropMaxY REAL NOT NULL,
      tileCropMaxX REAL NOT NULL,
      tileCropMaxY REAL NOT NULL,
      excludeContainsCsv TEXT,
      excludeNotContainsCsv TEXT,
      mediaType TEXT NOT NULL,
      forwardPreloadCount INTEGER NOT NULL DEFAULT 1,
      backwardPreloadCount INTEGER NOT NULL DEFAULT 1,
      oneFileAtATime INTEGER NOT NULL DEFAULT 0,
      rewindSeconds INTEGER NOT NULL DEFAULT 10,
      fastForwardSeconds INTEGER NOT NULL DEFAULT 10,
      showTileTitle INTEGER NOT NULL DEFAULT 1
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS last_preview_settings (
      id INTEGER PRIMARY KEY,
      thumbCompression INTEGER NOT NULL DEFAULT 50,
      thumbResolution INTEGER NOT NULL DEFAULT 250000,
      highlightResolution INTEGER NOT NULL DEFAULT 250000,
      highlightDuration REAL NOT NULL DEFAULT 6,
      highlightSegmentCount INTEGER NOT NULL DEFAULT 10,
      highlightFfmpegArg TEXT NOT NULL DEFAULT '-c:v libx264 -crf 25 -preset fast'
    )
  `)

  const insertStmt = db.prepare(
    `INSERT OR REPLACE INTO media (path, width, height, filesize, mdate, duration, media_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )

  const selectStmt = db.prepare(`SELECT * FROM media`)

  const deleteMediaStmt = db.prepare(`DELETE FROM media WHERE path = ?`)

  const selectPresetsStmt = db.prepare(
    `SELECT * FROM preset ORDER BY CASE WHEN name = 'default' THEN 0 ELSE 1 END, name ASC`,
  )

  const insertPresetStmt = db.prepare(`
    INSERT INTO preset (name, targetTilePercent, maxTilePercent, clusterCount, minAspectRatio, maxAspectRatio,
      minDuration, maxDuration, playerCropMaxX, playerCropMaxY, tileCropMaxX, tileCropMaxY,
      excludeContainsCsv, excludeNotContainsCsv, mediaType, forwardPreloadCount, backwardPreloadCount, oneFileAtATime,
      rewindSeconds, fastForwardSeconds, showTileTitle)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const deleteAllPresetsStmt = db.prepare(`DELETE FROM preset`)

  const selectPresetByNameStmt = db.prepare(`SELECT * FROM preset WHERE name = ?`)

  const selectPreviewSettingsStmt = db.prepare(`SELECT * FROM last_preview_settings WHERE id = 1`)

  const upsertPreviewSettingsStmt = db.prepare(`
    INSERT INTO last_preview_settings (id, thumbCompression, thumbResolution,
      highlightResolution, highlightDuration, highlightSegmentCount, highlightFfmpegArg)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      thumbCompression=excluded.thumbCompression, thumbResolution=excluded.thumbResolution,
      highlightResolution=excluded.highlightResolution, highlightDuration=excluded.highlightDuration,
      highlightSegmentCount=excluded.highlightSegmentCount, highlightFfmpegArg=excluded.highlightFfmpegArg
  `)

  function rowToPreviewSettings(row: Record<string, unknown>): PreviewSettings {
    return {
      thumbCompression: row["thumbCompression"] as number,
      thumbResolution: row["thumbResolution"] as number,
      highlightResolution: row["highlightResolution"] as number,
      highlightDuration: row["highlightDuration"] as number,
      highlightSegmentCount: row["highlightSegmentCount"] as number,
      highlightFfmpegArg: row["highlightFfmpegArg"] as string,
    }
  }

  function rowToPreset(row: Record<string, unknown>): Preset {
    return {
      name: row["name"] as string,
      targetTilePercent: row["targetTilePercent"] as number,
      maxTilePercent: row["maxTilePercent"] as number,
      clusterCount: row["clusterCount"] as number,
      minAspectRatio: (row["minAspectRatio"] as number | null) ?? null,
      maxAspectRatio: (row["maxAspectRatio"] as number | null) ?? null,
      minDuration: (row["minDuration"] as number | null) ?? null,
      maxDuration: (row["maxDuration"] as number | null) ?? null,
      playerCropMaxX: row["playerCropMaxX"] as number,
      playerCropMaxY: row["playerCropMaxY"] as number,
      tileCropMaxX: row["tileCropMaxX"] as number,
      tileCropMaxY: row["tileCropMaxY"] as number,
      excludeContainsCsv: (row["excludeContainsCsv"] as string | null) ?? null,
      excludeNotContainsCsv: (row["excludeNotContainsCsv"] as string | null) ?? null,
      mediaType: row["mediaType"] as Preset["mediaType"],
      forwardPreloadCount: row["forwardPreloadCount"] as number,
      backwardPreloadCount: row["backwardPreloadCount"] as number,
      oneFileAtATime: Boolean(row["oneFileAtATime"]),
      rewindSeconds: row["rewindSeconds"] as number,
      fastForwardSeconds: row["fastForwardSeconds"] as number,
      showTileTitle: Boolean(row["showTileTitle"]),
    }
  }

  function insertPreset(preset: Preset): void {
    insertPresetStmt.run(
      preset.name,
      preset.targetTilePercent,
      preset.maxTilePercent,
      preset.clusterCount,
      preset.minAspectRatio,
      preset.maxAspectRatio,
      preset.minDuration,
      preset.maxDuration,
      preset.playerCropMaxX,
      preset.playerCropMaxY,
      preset.tileCropMaxX,
      preset.tileCropMaxY,
      preset.excludeContainsCsv,
      preset.excludeNotContainsCsv,
      preset.mediaType,
      preset.forwardPreloadCount,
      preset.backwardPreloadCount,
      preset.oneFileAtATime ? 1 : 0,
      preset.rewindSeconds,
      preset.fastForwardSeconds,
      preset.showTileTitle ? 1 : 0,
    )
  }

  return Database.of({
    insertMedia: (entry) =>
      Effect.sync(() => {
        const result = insertStmt.run(
          entry.path,
          entry.width,
          entry.height,
          entry.filesize,
          entry.mdate,
          entry.duration,
          entry.media_type,
        )
        return result.changes > 0
      }),
    deleteMedia: (path) =>
      Effect.sync(() => {
        deleteMediaStmt.run(path)
      }),
    getAllMedia: () => Effect.sync(() => selectStmt.all() as MediaRecord[]),
    getPresets: () =>
      Effect.sync(() => (selectPresetsStmt.all() as Record<string, unknown>[]).map(rowToPreset)),
    putPresets: (presets) =>
      Effect.sync(() => {
        db.transaction(() => {
          deleteAllPresetsStmt.run()
          for (const p of presets) insertPreset(p)
        })()
      }),
    getPresetByName: (name) =>
      Effect.sync(() => {
        const row = selectPresetByNameStmt.get(name) as Record<string, unknown> | undefined
        return row ? rowToPreset(row) : null
      }),
    getPreviewSettings: () =>
      Effect.sync(() => {
        const row = selectPreviewSettingsStmt.get() as Record<string, unknown> | undefined
        return row ? rowToPreviewSettings(row) : null
      }),
    upsertPreviewSettings: (s) =>
      Effect.sync(() => {
        upsertPreviewSettingsStmt.run(
          s.thumbCompression, s.thumbResolution,
          s.highlightResolution, s.highlightDuration, s.highlightSegmentCount, s.highlightFfmpegArg,
        )
      }),
  })
})
