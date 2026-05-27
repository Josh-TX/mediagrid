# DB-Backed Media

## Description

I want to replace the current on-every-request filesystem walk with a SQLite database as the source of truth for Media. The current `scanMedia` function in `backend/src/scan.ts` is called on every `GET /api/images` request and re-walks the filesystem each time — I want to eliminate that entirely.

Instead, there should be a Scan task (a background operation) that walks `/media`, extracts metadata for each file, and persists it to a SQLite database at `/data/mediagrid.db`. The `GET /api/media` endpoint (renamed from `/api/images`) should query the database directly and assume its records are accurate without checking the filesystem.

### Database

The database lives at `/data/mediagrid.db` (a separate Docker volume from `/media`). Use `bun:sqlite` wrapped in an Effect service — no ORM. The schema has a single `media` table:

```sql
CREATE TABLE IF NOT EXISTS media (
  path TEXT PRIMARY KEY,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  filesize INTEGER NOT NULL,
  mdate INTEGER NOT NULL,
  duration INTEGER,
  media_type INTEGER NOT NULL
)
```

- `path`: relative path from `/media` root, used as primary key
- `duration`: null for images, milliseconds for videos
- `media_type`: integer enum — `1` = video, `2` = image. No other types for now.
- `mdate`: epoch milliseconds (replaces the old `mtime` field name)

### Scan Task

The Scan task walks `/media` recursively and inserts discovered files using `INSERT OR IGNORE` — already-known paths are silently skipped. Updating changed records is Clean's responsibility, not Scan's.

Scan handles both images (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`) and videos (`.mp4`, `.webm`, `.mov`, and similar). For images, use `image-size` to extract width and height. For videos, use `ffprobe` to extract width, height, and duration.

Scan auto-runs on server startup (as a background fiber). It is also triggerable on demand via `POST /api/tasks/scan`.

### API Changes

- Rename `GET /api/images` → `GET /api/media`. Same `?r=<seed>` query param, same shuffle logic, same 20-item limit. The handler now queries the `media` table instead of calling `scanMedia`.
- Add `POST /api/tasks/scan` to manually trigger a Scan.
- The `MediaEntry` type in `@repo/types` replaces `ImageEntry`. Drop the `name` field (derivable from path). Fields: `path`, `width`, `height`, `filesize`, `mdate`, `duration` (nullable int), `media_type` (int).

Update the frontend `fetchImages` → `fetchMedia` call to hit `/api/media` and decode against the new `MediaEntry` schema.

## Out of Scope

- Audio files (media_type reserved for future use but not implemented)
- Clean task (handled separately)
- Thumbnail-gen / Highlight-gen tasks
- Task Queue infrastructure beyond triggering Scan
