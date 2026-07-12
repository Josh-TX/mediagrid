# Shufflelist Media ID Refactor

## Description

I want to drastically reduce the memory footprint of cached shufflelists, and add the ability to delete media through the app.

Right now the `media` table's primary key is `path` (TEXT). I'm adding a new auto-incrementing integer column `id INTEGER PRIMARY KEY AUTOINCREMENT`, and `path` becomes a `UNIQUE NOT NULL` column instead of the primary key. AUTOINCREMENT matters here specifically: plain `INTEGER PRIMARY KEY` lets SQLite reuse a rowid after the max-id row is deleted, which could let a newly-scanned file silently take over a stale cache entry's id (making a shufflelist tile point at the wrong file instead of gracefully showing "deleted"). AUTOINCREMENT prevents that reuse. There are no prod deployments, so no migration path needs to be preserved — the schema can just change.

This `id` (mediaId) is backend-only and must never be exposed to the frontend. `model.Media` gains an `Id` field — this is safe because `model.Media` is never marshaled directly to any JSON response anywhere in the codebase (confirmed by grep); only the `shuffle.Tile`/`Row`/`Result` structs are, and those are built explicitly field-by-field. The response-facing `shuffle.Tile` struct gains an `Id int` field tagged `json:"-"`, so it can be threaded through during layout-building without any risk of leaking into the API response (Go's JSON encoder structurally skips it).

The shufflelist rand-cache (`RandCache`, used only for `sort=rand`) currently stores full `Row`/`Tile` structs, including `Path`, `Filesize`, `Mdate`, `IsVid`, `Preview`, etc. Instead, it should store a genuinely separate, lean type — `CacheTile{TileI, W, Id}` and `CacheRow{RowI, H, Tiles []CacheTile}` — not just a `Tile` with the extra fields zeroed. A zeroed-but-same-struct approach still pays for all the fixed-size fields (~80 bytes/tile); the dedicated lean type is ~24 bytes/tile, which is what actually delivers on "drastically reduce memory footprint," especially by dropping the variable-length `Path` string content from cache storage entirely.

On a cache miss, the existing pipeline (`ListAllMedia` → `Filter` → `BuildRandomRows`) is unchanged — it already has full `model.Media` in hand, so the currently-requested page's response can be built directly from that, while a stripped-down `CacheRow`/`CacheTile` version gets written into `RandCache` for next time.

On a cache hit, the stored `CacheTile`s for the requested page (after row-range resolution, same as today) need to be hydrated back into full response `Tile`s by looking up their `Id`s in the `media` table. This should be a single batched query (`WHERE id IN (...)`) covering all ids on the page, not one query per tile. If an id from the cache isn't found in the `media` table (because the file was deleted via the app after this shufflelist was cached), handle it gracefully rather than erroring: synthesize a `Tile` with `Path: "//deleted"` and simple zero-value defaults for everything else (`Filesize: 0`, `Mdate: 0`, `IsVid: false`, `Duration: 0`, `Preview` zero-value). No pointer/null types needed — plain zero values are fine, since the frontend keys off the sentinel path, not nullness.

No cache invalidation is needed when a delete happens. Since AUTOINCREMENT prevents id reuse, a stale cached tile referencing a since-deleted id will simply and correctly resolve to `//deleted` the next time it's read (whether immediately or near the end of its TTL) — this is the intended graceful-degradation behavor, not a bug to work around.

The `/api/shuffle` route's request/response interface is otherwise unchanged. The existing `os.Stat`-based `populatePreviewFlags` logic (checking thumbnail/highlight existence for just the returned page) stays as-is.

### New delete endpoint

Add `DELETE /api/delete/{path...}`, following the existing multi-segment path-param convention (like `GET /media/{path...}`). It should:
1. Delete the on-disk media file and its thumbnail/highlight preview files first (best-effort — ignore "not exist" errors, mirroring the existing `scan.Clean` pattern).
2. Delete the row from the `media` table last.

This order matters: doing the file/preview deletion first means that if the DB delete somehow fails, the existing `scan.Clean` self-healing logic (which already removes rows whose backing file is missing) will clean it up on the next scan. Doing it in the opposite order risks the file being "resurrected" as a new row on the next scan if file removal fails after the DB row is already gone.

Keep this endpoint's own semantics simple: no special-casing needed for a path that isn't found in the `media` table (idempotent is fine), since correctness doesn't hinge on it. There is no UI trigger for this endpoint in this spec — it's being built now for future use, wiring up a trigger is explicitly out of scope.

### Frontend

Keep changes minimal. The shuffle response shape is unchanged from the frontend's point of view — it just now may contain tiles with `path: "//deleted"` and zeroed other fields.

- In `fetchShuffle()` (`api/shuffle.ts`), derive and attach an `isDeleted` boolean to each tile centrally, right after parsing the response, so downstream components check `tile.isDeleted` rather than repeating the `path === "//deleted"` string comparison.
- Gallery `Tile.vue`: route deleted tiles into the existing plain gray `placeholder` branch (no new text/icon) — reuse what's there.
- Player `PlayerMedia.vue`: show a full-viewport static "file is deleted" message in place of the video/img element (persistent, not a toast — simpler than wiring up toast timing/lifecycle).
- `PlayerHud.vue`: leave essentially untouched. It stays fully visible (do not hide/suppress it — the "back" button it contains is the only touch-based way to close the Player on mobile, and there's no other close affordance). The title naturally renders as "deleted" from `"//deleted"`'s last path segment with no code change needed. The info tooltip (date/filesize/resolution/duration) is also left alone, showing whatever the zeroed defaults compute to — no extra hide-logic needed, per the minimal-changes goal.

## Out of Scope

- Wiring up any UI trigger (button, gesture, menu) that calls `/api/delete/<path>` — this spec only builds the endpoint itself.
- Handling media files deleted outside the app (i.e., not through `/api/delete`) — that continues to be handled solely by the existing scan/`scan.Clean` flow, unchanged by this spec.
