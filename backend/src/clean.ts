import { FileSystem } from "@effect/platform"
import { Effect } from "effect"
import * as path from "node:path"
import { Database } from "./db"
import type { MediaRecord } from "./db"

/** Checks if the media file exists on disk; if missing, deletes the DB record. Returns true if deleted. */
export function checkAndDeleteIfMissing(
  record: MediaRecord,
  mediaDir: string,
): Effect.Effect<boolean, never, Database | FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const abs = path.join(mediaDir, record.path)
    const exists = yield* fs
      .stat(abs)
      .pipe(Effect.map(() => true), Effect.catchAll(() => Effect.succeed(false)))
    if (exists) return false
    const db = yield* Database
    yield* db.deleteMedia(record.path)
    return true
  })
}
