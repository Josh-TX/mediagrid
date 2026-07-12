# Video Tile Playback Highlights

## Description

I want to rework the gallery's tile/preview data model and add real thumbnail/highlight serving to the API. Right now `Tile.preview.path` is just a duplicate of the original media path, there's no `hasThumbnail`/`hasHighlight` signal anywhere, and the grid always loads full-size originals for every tile — even though thumbnail/highlight generation already exists as a background task. This spec wires the frontend up to actually use generated thumbnails and highlights, with images and videos falling back through original media as appropriate.

### Data model changes

`Tile` (backend `shuffle.Tile` / frontend `Tile` type) should have: `tilei`, `w`, `path`, `isVid`, `duration` (plain `int`, `0` for images — `isVid` remains the authoritative image/video signal, not a null-check on duration), `filesize`, `mdate`, and a nested `preview` object.

`Preview` (backend `shuffle.PreviewData` / frontend `PreviewData` type) should have: `h`, `w`, `hasThumbnail`, `hasHighlight`. `h`/`w` are the **original media's** dimensions (not the generated thumbnail/highlight file's actual pixel dimensions) — thumbnails/highlights are assumed to preserve aspect ratio, so this avoids extra I/O to read generated file headers. The `w` field intentionally exists on both `Tile` (for row/layout sizing) and `Preview` (media pixel width) — this duplication is expected, not a bug.

`filesize`, `mdate`, `duration`, and `path` move off of `Preview` and onto `Tile` (they were previously duplicated on both). `Preview` gains `hasThumbnail`/`hasHighlight`, which don't exist today in any form.

The `Preview` object should always be present on every tile (never null), even when neither a thumbnail nor a highlight exists, since its `h`/`w` are needed to size the gray placeholder div to the correct aspect ratio.

`isVid` stays as-is on `Tile` (this was originally going to be removed in favor of a null `duration`, but we simplified back to keeping `isVid` explicit and `duration` as a plain non-nullable int). Internal backend code (`model.Media.IsVid`, scan/filter/ffmpeg logic) is unaffected by this spec — no internal refactor to derive video-ness from duration.

### API routes

Add two new routes mirroring the existing `GET /media/{path...}` pattern (no `/api` prefix, same path-traversal guard):

- `GET /thumbnail/{path...}`
- `GET /highlight/{path...}`

Both take the original media's relative path and the backend is responsible for deriving the on-disk generated-file location itself (reusing the existing `preview.ThumbnailPath`/`preview.HighlightPath` helpers, e.g. appending `.webp` / `.mp4` under `PREVIEW_ROOT`), the same way the generation tasks already do. The frontend never constructs thumbnail/highlight file paths itself — it only knows the media's `path` and which route to hit.

### hasThumbnail / hasHighlight computation

Shufflelists can be huge, so existence must NOT be checked (`os.Stat`) across an entire cached shufflelist. Instead, `hasThumbnail`/`hasHighlight` should be computed only for the specific page of rows/tiles actually being returned by a given `GET /api/shuffle` request, right before serializing the response.

### Frontend loading logic

**Images**: always load the thumbnail if `hasThumbnail` is true; otherwise load the original via `/media`. No placeholder case for images.

**Videos**: governed by the existing `autoPlayTile` preset setting (`off` | `hover` | `always`) and the existing `fallbackToOriginal` preset setting (both already implemented end-to-end today, just currently inert/unused for this purpose):

- **`off`**: show thumbnail if `hasThumbnail`, else a gray placeholder div sized to the preview's aspect ratio. Never plays anything.
- **`hover`**: idle state is the same as `off` (thumbnail or placeholder). On mouse-enter/touch-start:
  - if `hasHighlight`, play the highlight (muted) in place of the idle preview.
  - else if `fallbackToOriginal` is true, play the original video (muted).
  - else, stay on the idle state (thumbnail/placeholder) — hovering has no visible effect.
  
  On mouse-leave/touch-end, revert to the idle state (existing pause/reset behavior).
- **`always`**: same priority order as hover's active state, but engaged immediately/automatically rather than on hover:
  - if `hasHighlight`, autoplay the highlight (muted).
  - else if `fallbackToOriginal` is true, autoplay the original video (muted).
  - else, show thumbnail if `hasThumbnail`, else placeholder.

The Player (full-screen swipe view) is explicitly out of scope for loading-behavior changes — it continues to always load the original media file regardless of these settings. It only needs its code updated to match the new `Tile`/`Preview` field shapes (e.g. reading `tile.duration` instead of `tile.preview.duration`).

### Tile overlays (new UI — doesn't exist on grid tiles today)

- **Duration badge**: top-right corner of the tile, shown only when `isVid` is true. Styled as a badge/chip: semi-transparent black background, white text.
- **Title**: bottom-left corner of the tile, derived from `tile.path` (filename without extension) on the frontend — no new backend `title` field. White text, with a subtle black gradient behind it (bottom-up) for contrast rather than a hard background.
- Both overlays render on top of whatever preview state is showing, including the gray placeholder — placeholders are not bare.
- Long titles truncate to a single line with ellipsis rather than wrapping.

## Out of Scope

- Any change to the full-screen Player's media-loading behavior (it keeps loading originals always).
- Persisting `hasThumbnail`/`hasHighlight` in a DB/cache — this spec computes them on the fly per-request, scoped to the returned page only.
- Reading actual generated thumbnail/highlight file dimensions — `preview.h`/`preview.w` reuse the original media's known dimensions.
- Refactoring internal backend video-detection logic (`model.Media.IsVid` and its internal consumers) to derive from duration instead.
