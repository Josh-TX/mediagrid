# Gallery Tile Context Menu

## Description

I want to right-click (or long-press, on mobile) any Gallery tile — image or video — and get a custom context menu with four options: **Open**, **Open Raw**, **Rename**, and **Delete**. This menu is Gallery-only (not in the Player).

Most mobile browsers already fire the native `contextmenu` DOM event on long-press, so a single `@contextmenu` handler on the tile covers both desktop right-click and mobile long-press — no separate touch-timer logic needed.

The menu itself should be a lightweight custom popup component (not a browser-native menu): a fixed-position div anchored at the cursor/touch coordinates, styled to match the app's existing dark/panel aesthetic, dismissed on outside-click, Escape, or after an item is selected.

### Menu items

- **Open** — same as tapping the tile (triggers whatever `onClick`/`urlStore.openTile` already does).
- **Open Raw** — opens the raw original media URL in a new tab (same URL the Player would load), unrelated to thumbnail/highlight.
- **Rename** — see below.
- **Delete** — native `confirm()`, and if confirmed, calls the existing `DELETE /api/delete/{path...}` endpoint.

### Rename

Uses a native `prompt()` pre-filled with just the base filename (no extension, no directory) — the file stays in the same folder and the extension can't be changed. The prompt message should tell the user the extension stays as `<ext>`.

Frontend validation before sending (and always trimmed first): reject empty names and names containing `/` or `\`. If the trimmed name is unchanged from the original, treat as a no-op (close menu, no request sent).

If validation fails, or the backend returns an error (e.g. name conflict), re-prompt (with the error reflected in the message and the previously-typed name pre-filled) rather than showing an alert — this lets the user fix and resubmit, or cancel out entirely.

Add a new backend endpoint: `PUT /api/rename/{path...}` with a JSON body `{"newName": "<filename-with-extension>"}` (the frontend appends the preserved extension to the base name before sending). Returns `204 No Content` on success — the frontend already knows the resulting path (same directory + newName), no need for the backend to echo it back.

Backend also validates: rejects `newName` containing `/` or `\` (same guard style as the existing `pathWithinRoot` check used by delete). Order of operations, mirroring the delete handler's disk-first pattern:
1. Compute new path (same directory as old path, new filename). Confirm the old path's file exists on disk — if not, return an error (404-ish); unlike delete, rename is not idempotent since there's nothing sensible to rename.
2. If the target path already exists on disk, return an error (conflict) — do not overwrite, do not auto-suffix.
3. Rename the media file on disk (`os.Rename`).
4. For thumbnail and highlight (derived via the existing `preview.ThumbnailPath`/`preview.HighlightPath`), check if each exists first, and only if it exists, rename it to the corresponding new derived path. It's perfectly fine for no preview to exist — not an error. (Overwriting a target preview path in the rare collision case is fine, since the source media rename already succeeded.)
5. Update the DB row's `path` column (`UPDATE media SET path = ? WHERE path = ?`).

If the disk rename fails at step 3, abort before touching the DB (same reasoning as delete: never let the DB get out of sync with what's actually on disk).

After a successful rename, the frontend locally updates just the specific tile (identified by the `tilei` the context menu was opened on) in the gallery's local row data — no full reshuffle/refetch. No id-based matching needed; the path is known to be unique per shufflelist.

### Delete completion (frontend)

After a successful delete, there's no special "deleted" state to track — the tile's local data is left as-is (same path). Instead, the frontend forces the tile's preview element to immediately re-attempt loading (bypassing any stale in-memory/cached image), so the existing generic "failed to load" UI (see below) kicks in right away rather than leaving a misleading stale preview on screen.

If the delete (or rename) request itself fails (network/server error), show a native `alert()` with the error and leave the tile/data untouched — no forced reload, since nothing on disk actually changed. No loading spinner is needed during rename/delete requests; these are local-network operations expected to be fast.

### Generic failed-load UI (Gallery tiles)

Currently `Tile.vue` has no `@error` handling at all on its `<img>`/`<video>` elements. Add it, and make sure only a single network request is attempted per tile (no chained fallback attempts after a failure — whatever `resolveTileSource` decided to load is the only thing tried).

When that load fails, show an elegant centered message inside the tile (small font, muted color, line-wrapping allowed), text depending on what was actually being attempted:
- Source was `'thumbnail'` → "failed to load thumbnail"
- Source was `'highlight'` → "failed to load highlight"
- Source was `'original'` and the tile is a video (autoplay fallback-to-original case) → "failed to load video"
- Source was `'original'` and the tile is an image → "failed to load image"

This generic handling requires no special-casing for anything — it naturally covers both in-app deletes (once the forced-reload kicks in) and the pre-existing `"//deleted"` sentinel path from the `shufflelist-media-id-refactor` spec (previously deferred), since both simply manifest as a failed network request for whatever source was attempted.

### Generic failed-load UI (Player)

`PlayerMedia.vue` also has no `@error` handling today. Add it: if the raw media fails to load, show "failed to load video" or "failed to load image" (based on `tile.isVid`) centered over that slide. The rest of the Player (HUD, swipe to next/prev) keeps working completely normally — a failed slide is just an inert placeholder in the swipe sequence, nothing is disabled.

## Out of Scope

- Any context menu inside the Player (Gallery tiles only).
- Moving a file to a different directory via rename (only the filename changes; directory is fixed).
- Bulk/multi-select delete or rename.
