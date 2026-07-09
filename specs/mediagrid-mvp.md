# MediaGrid MVP

## Description

I want to build MediaGrid, a mobile-first local media player, as a full rewrite replacing the old TypeScript/Bun project. The backend is Go with SQLite; the frontend is Vue 3 using the composition API with `<script setup>`. This spec covers the Gallery, the shuffle/presets API, the settings modal, and the startup media scan. The Player itself is out of scope — clicking a tile just calls `alert("not implemented")`.

### Deployment & dev workflow

Production is a single Go binary: the built Vue `dist/` is embedded via `go:embed` and served by the Go process alongside the API on one port (`PORT` env var, default `8080`). In development, run the Vite dev server with a proxy for `/api/*` and `/media/*` to the Go backend for hot reload.

Backend uses the Go standard library only for routing (no chi/gin/etc), and `modernc.org/sqlite` (pure Go, no cgo) as the SQLite driver. Backend gets basic test coverage via the standard `testing` package, focused on the shuffle endpoint's layout/filter/sort logic. Frontend is TypeScript + Vite + Vitest, styled with plain scoped `<style scoped>` blocks per SFC (no CSS modules, no utility framework). No router library and no Pinia for now — plain Vue composables/reactive state, organized loosely as a "store pattern" (a reactive singleton module) rather than prop-drilling, since that's simplest for the current scope.

### Media root & database

The media library root is configured via a `MEDIA_ROOT` env var (required at startup). All `path` values stored in the DB and returned by the API are relative to `MEDIA_ROOT`, not absolute, and are returned raw/unencoded — the frontend is responsible for URL-encoding path segments when building request URLs (filenames can contain unusual characters).

```sql
CREATE TABLE IF NOT EXISTS media (
  path TEXT PRIMARY KEY,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  filesize INTEGER NOT NULL,
  mdate INTEGER NOT NULL,
  duration INTEGER,
  isvid INTEGER NOT NULL
)
```

- `duration` is whole seconds, `mdate` is a Unix timestamp in seconds, `filesize` is bytes.
- `width`/`height` must account for EXIF/rotation metadata — if `ffprobe` reports a 90°/270° rotation, swap width and height before storing so stored dimensions always match the media's actual display orientation.

There's a second `presets` table: one row per preset, one column per setting, plus a `name` column that acts as the primary key (must be unique).

### Startup scan

On startup, the HTTP server starts immediately (non-blocking) while a scan runs in a background goroutine. The scan walks `MEDIA_ROOT` recursively, sequentially (no worker pool for now), skipping dotfiles/dot-directories and not following symlinks. Recognized extensions:

```
IMAGE_EXTS = {.jpg, .jpeg, .png, .gif, .webp}
VIDEO_EXTS = {.mp4, .webm, .mov, .mkv, .avi, .m4v}
```

For each matching file, check if its path already exists in `media`. If not, run `ffprobe` to get width/height/duration (applying the EXIF rotation swap above) and insert a row. The scan does not remove rows for files that no longer exist on disk — that's deferred to a future "clean" task. There's also no live-refresh mechanism for the gallery while a scan is in progress; for this v1 the user just waits or hits re-randomize to pick up newly-scanned media.

### `GET /api/shuffle`

Response shape:

```
{
  totalRows: number,
  totalTiles: number,
  rows: [
    {
      rowi: number,
      h: number,
      tileW: number,
      tiles: [
        {
          tilei: number,
          path: string,
          isVid: bool,
          preview: {
            path: string,
            w: number,
            h: number,
            filesize: number,
            mdate: number,
            duration: number,
            isVid: bool
          }
        }
      ]
    }
  ]
}
```

Note `tileW` lives on the row (all tiles in a row share the same width) rather than per-tile, since this simplifies row layout. The nested `preview` object is kept even though right now it's always identical to the tile's own media data (no real thumbnail/highlight generation exists yet — see "Preview fallback" below); this keeps the shape stable for when real previews are added later.

Required query params: `tilePct`, `screenW`, `screenH` (viewport dimensions in pixels).

Optional query params:
- `minr`, `maxr` — row index range to return (absolute/global indices into the full shuffled list, not relative to the page)
- `f` — SimpleFilter: space-delimited terms, case-insensitive substring match against the media's relative path, all terms must match (AND)
- `sort` — `rand` (default), `size`, `az`, `date`
- `dir` — `asc`/`desc`; per-sort-type default when omitted: `size` defaults `desc`, `date` defaults `desc`, `az` defaults `asc`. `az` sorts by full relative path, case-insensitive.
- `exVids` — excludes videos when `1`
- `exImgs` — excludes images when `1`
- `exPort` — excludes portrait media (aspect ratio ≤ 1) when `1`
- `exLand` — excludes landscape media (aspect ratio ≥ 1) when `1`
- `minDur`, `maxDur` — video duration bounds in seconds; only affects videos (no effect on images); `0`/unset means no bound
- `whitelist` — CSV of terms; media must case-insensitively substring-match at least one term (OR) to be included
- `blacklist` — CSV of terms; media matching any term (case-insensitive substring) is excluded
- `basepath` — case-insensitive prefix match against the relative path
- `reshuffle` — set to `1` to bust the rand-order cache and force a fresh shuffle

`mint`/`maxt` (tile-index range) from the original draft are dropped for now — not needed until the Player exists, may return later.

Filtering overall is: SimpleFilter (`f`) AND PresetFilter (whitelist/blacklist/aspect/duration/basePath/type excludes) — all these individual gates AND together, except whitelist/blacklist terms which OR within their own list.

### Row/tile layout algorithm (intentionally simple — will be replaced later)

This is a placeholder algorithm; precise adherence to `tilePct` doesn't matter right now:

- `columns = round(1 / tilePct)`, minimum 1
- `tileW = floor(screenW / columns)`
- `h = tileW` (square tiles for now)
- Tiles are assigned to rows sequentially in sort order, `columns` tiles per row (the final row may have fewer)

Important: even though this algorithm currently produces the same `h` for every row, **the frontend must not assume uniform/constant row height** — a future update will make row height vary per row, and the virtual-scroll implementation needs to already support that (see Gallery section below).

Tile fitting uses a crop-then-letterbox hybrid, governed by `tileCropX`/`tileCropY` (max crop fraction per axis from the preset): try to crop-to-fill the tile; if the crop needed to fully fill exceeds the allowed budget on that axis, crop only up to the budget and letterbox (black bars) the remaining excess. Row/tile gaps are 1px, colored white. Letterboxed areas are black.

### Preview fallback

No thumbnail/highlight generation exists yet. The `preview` object always mirrors the original media's own fields (same path/w/h/filesize/mdate/duration/isVid). The `fallbackToOriginal` Gallery Setting stays in the preset schema (default `true`) as a currently-inert field, reserved for when real preview generation exists.

### Video tiles in the Gallery

Since previews are just the original video file, video tile playback is controlled by the `autoPlayTile` Gallery Setting, which has three real (implemented now) values:
- `off` — static poster frame (`<video preload="metadata">`, no playback)
- `hover` — plays muted+looped on hover/tap-hold
- `always` — autoplays muted+looped whenever the tile is visible in the viewport

### Rand-sort caching

The server caches a shuffled order for `sort=rand`, keyed by a hash of the active filter params (`f`, `exVids`, `exImgs`, `exPort`, `exLand`, `minDur`, `maxDur`, `whitelist`, `blacklist`, `basepath`). TTL is 30 minutes, sliding — every cache hit resets the TTL. The toolbar's re-randomize button explicitly busts the cache for that key (`reshuffle=1`) and generates a fresh order.

### `GET /api/presets`

Returns a list of preset objects, each with a `name` plus every Gallery/Filter/Player setting. If no preset named `"default"` exists in the DB, the response synthesizes one on the fly using default values — but does **not** persist it; it keeps being synthesized on every `GET` until the user explicitly saves presets including one named `"default"`.

### `POST /api/presets`

A single endpoint that wholesale-replaces the entire `presets` table with the array of preset objects in the request body. There are no separate per-preset create/rename/delete/duplicate endpoints — the settings modal manages all of that as local client-side array edits, and "save permanently" is the only thing that persists, via this one endpoint.

### Preset settings

**Gallery Settings** — `tilePct` (float 0–1, default `0.15`), `tileCropX` (default `0.1`), `tileCropY` (default `0.1`), `defaultSort` (default `rand`), `autoPlayTile` (`off`/`hover`/`always`, default `off`), `fallbackToOriginal` (bool, default `true`, currently inert).

**Filter Settings** — `includeVids` (default `true`), `includeImages` (default `true`), `includePortrait` (default `true`), `includeLandscape` (default `true`), `minDuration` (default `0`), `maxDuration` (default `0` = no max), `whitelistCSV` (default empty), `blacklistCSV` (default empty), `basePath` (default empty).

**Player Settings** — stored but not functionally wired up yet since the Player is out of scope: `onVidEnd` (`loop`/`stop`/`next`, default `next`), `playerCropX` (default `0.2`), `playerCropY` (default `0.2`), `rewindSeconds` (default `10`), `forwardSeconds` (default `10`).

### `GET /media/<path>`

Serves the raw file bytes from disk, joining the (URL-decoded) path with `MEDIA_ROOT`, with path-traversal protection.

### Preset selection & URL sync

On load, the frontend calls `GET /api/presets` first. If the URL has a `preset` query param matching an existing preset name, that preset is selected; otherwise fall back to `"default"`. It then calls `GET /api/shuffle` with `maxr=20` and the selected preset's relevant settings. Switching presets afterward (via the toolbar dropdown) updates the URL's `preset` param via `history.replaceState` (no new history entry), so the current view stays bookmarkable/shareable.

### Gallery: virtual + infinite scroll

Infinite scroll only ever loads rows sequentially from the top, so the scrollable track's total height is just the sum of `h` for all rows loaded so far — there's no need to estimate heights for not-yet-loaded rows. Fetching the next batch (20 rows, via `minr`/`maxr`) is triggered by a numeric check (`scrollTop + clientHeight > totalLoadedHeight - threshold`) inside the same scroll handler that drives virtualization — not a separate IntersectionObserver sentinel, since a sentinel would get unmounted by virtualization itself. As established above, the implementation must treat row height as per-row/variable, not assume a constant, even though the current layout algorithm happens to produce uniform heights.

Changing the filter, sort, or preset resets the gallery back to row 0 and re-fetches.

### Toolbar (left to right)

1. Sort/re-randomize button — a re-randomize icon when `sort=rand`; otherwise an up/down arrow reflecting (and toggling, on click) the current sort direction.
2. A narrow `<select>` for sort type (rand/size/az/date).
3. A text input for the SimpleFilter, debounced 300ms before triggering a re-fetch.
4. A `<select>` for the selected preset.
5. A gear icon opening the settings modal.

Styling is minimalistic throughout — no backgrounds, white icons.

### Settings modal

Header: a `<select>` for the current preset, plus rename/delete/dupe/new-preset buttons, all using native `prompt()`/`confirm()`:
- **New preset** — `prompt()` for a name, defaulting to `"New Preset"` (or `"New Preset N"` if taken).
- **Duplicate** — `prompt()` for a name, suggesting `"<original name> copy"`.
- **Rename** — `prompt()` pre-filled with the current name.
- **Delete** — `confirm()` before deleting. If the deleted preset was the currently-selected one, fall back to selecting `"default"` (or the first remaining preset if `"default"` itself was deleted).
- Any of these actions that would result in a duplicate preset name gets rejected with `alert()` and doesn't happen (name is effectively a unique key).

Middle: a scrollable list of settings, one per row — label on the left, input on the right, and a `?` icon that shows an explanation both on hover (desktop) and on tap/click (mobile, since hover doesn't exist there).

Footer: a close button on the left; revert and "save permanently" buttons on the right.
- Edits to settings apply to local state immediately, but the Gallery underneath only re-fetches once the modal is closed (not live while the modal is still open).
- **Revert** discards local edits and reloads from the last-saved-on-server state (or defaults, if nothing has ever been saved).
- **Save permanently** sends the full current preset list to `POST /api/presets`.

### Loading & error states

A small centered spinner/"Loading..." indicator shows during the initial shuffle fetch. On fetch failure, a simple retry-able error message appears in the same spot. Kept minimal, no toasts/modals for this.

### Out of scope callouts inline

Clicking a tile calls `alert("not implemented")` — the Player is a separate future spec.

## Out of Scope

- The Player itself (full-viewport swipe navigation, Hud, video playback controls) — tile clicks just `alert("not implemented")`.
- Real thumbnail/highlight generation — `preview` always mirrors the original media for now.
- Any background task system beyond the simple sequential startup scan (e.g. a task queue/UI).
- A "clean" task to remove `media` rows for files that no longer exist on disk.
- `mint`/`maxt` query params on `/api/shuffle`.
- Any scan-progress indicator or live gallery refresh while a background scan is in progress.
