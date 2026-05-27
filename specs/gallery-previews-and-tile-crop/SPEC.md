# Gallery Previews and Tile Crop

## Description

I want the gallery to display the best available preview for each media item rather than always fetching the original file. I also want tiles to have a fixed computed height and respect the `tileCropMaxX` / `tileCropMaxY` preset settings when fitting a preview into a tile.

### Preview resolution

The backend currently uses `PreviewInfo` (from `@repo/types`) as the type for both DB media records and client-facing tile data. I want to split these into two distinct types:

- **`MediaRecord`** — a backend-only type (not in `@repo/types`) that matches the DB schema: `path`, `width`, `height`, `filesize`, `mdate`, `duration`, `media_type`. No `previewType`.
- **`PreviewInfo`** — the existing shared type in `@repo/types`, extended with a new required field `previewType: "original" | "thumbnail" | "highlight" | "placeholder"`.

All backend files that currently use `PreviewInfo` for DB/shuffle internals (`db.ts`, `cluster-shuffle.ts`, `shuffle-cache.ts`, `filter.ts`, `clean.ts`) should use `MediaRecord` instead. Since TypeScript uses structural typing, no explicit mapping ceremony is needed — just update the type names.

`previewType` is resolved **per request**, not at shuffle creation time. The shuffle cache stores `MediaRecord` objects. When the router is about to return a set of blocks (typically ~20 tiles), it checks disk for each tile's media and sets `previewType` before serializing the response:

- For images (`media_type !== 1`): if `/data/thumbnails/{path}.webp` exists → `"thumbnail"`, else → `"original"`.
- For videos (`media_type === 1`): if `/data/highlights/{path}.mp4` exists → `"highlight"`, else if `/data/thumbnails/{path}.webp` exists → `"thumbnail"`, else → `"placeholder"`.

The `path` field in `PreviewInfo` always remains the original media path. The frontend derives the fetch URL from `previewType` + `path`:
- `"original"` → `/media/{path}`
- `"thumbnail"` → `/thumbnails/{path}.webp`
- `"highlight"` → `/highlights/{path}.mp4`
- `"placeholder"` → no network request; render a styled element

### New backend routes

Add two new file-serving routes alongside the existing `/media/*`:

- `GET /thumbnails/*` — serves files from `/data/thumbnails/`
- `GET /highlights/*` — serves files from `/data/highlights/`

### gen-highlights directory change

Update `gen-highlights.ts` to write output files to `/data/highlights/{path}.mp4` instead of the current `/data/videos/{path}.mp4`. Update the existence check accordingly.

### Frontend rendering per previewType

The `Block` component's tile renderer switches on `previewType`:

- `"original"` or `"thumbnail"` → `<img>` element
- `"highlight"` → `<video autoplay muted loop playsinline>` element; each video element gets a `useEffect` that creates an `IntersectionObserver` watching that element — calls `video.play()` when entering the viewport and `video.pause()` when leaving. Wrap `play()` in try/catch to handle browser autoplay policy rejections silently.
- `"placeholder"` → a `<div>` with a dark background (`#222` or similar) and the filename displayed in tiny centered text (e.g., `font-size: 0.6rem`, `color: rgba(255,255,255,0.5)`). The filename is the last segment of `preview.path`.

### Block height computation

Currently tiles have no fixed height — the `<img>` sets height via `height: auto`. I want each block to have a computed fixed height in pixels so that tile crop can work.

In the `Gallery` component, attach a single `ResizeObserver` to the gallery container element and store the observed width as `galleryWidthPx` in state. Pass `galleryWidthPx` as a prop to each `Block`.

Inside `Block`, compute the block height in pixels:

```
blockHeightPx = mean over all tiles of (tile.width * galleryWidthPx / previewAspectRatio)
```

where `previewAspectRatio = preview.width / preview.height`.

Each tile's cell container gets `height: blockHeightPx` (in px) and `overflow: hidden; position: relative`. The preview element inside is absolutely positioned and centered.

### Tile crop algorithm

The Gallery passes `tileCropMaxX` and `tileCropMaxY` from the active preset as props to `Block`. `Block` applies the following algorithm per tile to compute the preview element's inline `width` and `height` in pixels, then centers it absolutely inside the fixed-height container:

Let:
- `tileW = tile.width * galleryWidthPx`
- `blockH = blockHeightPx`
- `tileAR = tileW / blockH`
- `previewAR = preview.width / preview.height`

**If `previewAR < tileAR`** (preview is more portrait than tile — crop top/bottom):
- Scale to tile width: `imgH = tileW / previewAR`
- Max allowed height before exceeding crop limit: `maxImgH = blockH / (1 - 2 * tileCropMaxY)` (if `tileCropMaxY >= 0.5`, treat as unconstrained)
- `imgH_final = min(imgH, maxImgH)`
- `imgW_final = imgH_final * previewAR`

**If `previewAR > tileAR`** (preview is more landscape than tile — crop left/right):
- Scale to block height: `imgW = blockH * previewAR`
- Max allowed width: `maxImgW = tileW / (1 - 2 * tileCropMaxX)` (if `tileCropMaxX >= 0.5`, treat as unconstrained)
- `imgW_final = min(imgW, maxImgW)`
- `imgH_final = imgW_final / previewAR`

**If `previewAR === tileAR`** (perfect match):
- `imgW_final = tileW`, `imgH_final = blockH`

In all cases, render the element as `position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: imgW_final; height: imgH_final`. The container's `overflow: hidden` handles any remaining crop. The element is centered so any overflow is clipped equally on both sides.

Remove the existing `.cell img { width: 100%; height: auto }` CSS rule — sizing is now handled entirely via inline styles.

## Out of Scope

- `videoCropMaxX` and `videoCropMaxY` — these are for the Player and will be addressed separately.
- Player changes — the Player continues to show original media and is unaffected by this spec.
- Invalidating shuffle cache when new thumbnails/highlights are generated — stale cache entries will naturally expire.
