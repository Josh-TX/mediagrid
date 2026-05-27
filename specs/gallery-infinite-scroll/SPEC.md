# Gallery Infinite Scroll

## Description

I want to replace the current flat 20-item `GET /api/media` endpoint with a block-based infinite scroll Gallery. The Gallery is divided into Blocks, each a 2×2 grid of Cells. Every Tile occupies exactly one Cell (rowspan=1, colspan=1) for now — complex tile spans are a future concern.

### Types (`@repo/types`)

Replace `MediaEntry` with the following Effect Schemas:

- **`PreviewInfo`**: same fields as `MediaEntry` (path, width, height, filesize, mdate, duration, media_type), just renamed. No preview URL field yet — the original media path is the preview for now.
- **`TileInfo`**: `{ index: number, x: number, y: number, rowspan: number, colspan: number, preview: PreviewInfo }`. `index` is the tile's global position in the Shuffle (0-based). `x` and `y` are 0-based Cell coordinates within the Block.
- **`BlockInfo`**: `{ index: number, tiles: TileInfo[] }`.
- **`BlockResponse`**: `{ totalBlocks: number, totalMedia: number, blocks: BlockInfo[] }`.

### Backend: `GET /api/blocks`

This route replaces `GET /api/media` entirely.

Query params:
- `r` (required integer seed): missing or invalid → 400.
- `indices` (required comma-separated integers): missing or empty → 400. Duplicate indices are silently deduplicated. Out-of-bounds indices are silently omitted from the response.
- `q` (optional): space-delimited SimpleFilter terms, AND logic, case-insensitive path match. Same behavior as the existing `q` param on `/api/media`.

Response is a `BlockResponse`. Block layout rules:
- Each Block is a 2×2 grid (4 Cells). Each Tile occupies 1 Cell.
- Tiles fill row-major order: tile 0 → (x=0, y=0), tile 1 → (x=1, y=0), tile 2 → (x=0, y=1), tile 3 → (x=1, y=1).
- The last Block may be partial (1–3 tiles) if totalMedia is not divisible by 4.
- `totalBlocks = ceil(totalMedia / 4)`.

### Frontend: Infinite Scroll

On mount, fetch blocks at indices 0, 1, 2. Use an IntersectionObserver on the last loaded Block — when it approaches the viewport, fetch the next block (index = number of loaded blocks). Continue until all blocks are loaded (`loadedBlocks.length === totalBlocks`).

When the Seed or SimpleFilter changes (user types in search or clears it), wipe all loaded blocks, scroll to top, generate a new Seed, and restart from block 0. This follows the existing behavior from the gallery-toolbar spec.

**Loading state**: while fetching, show skeleton cells — 4 grey placeholder cells arranged in a 2×2 grid per pending Block.

**Error state**: on fetch failure, show an error toast via `@radix-ui/react-toast` (add to `frontend/package.json`), remove the skeleton cells, and stop trying to load more.

**Empty state**: when `totalMedia = 0`, show a centered "No results" message in place of the grid.

**End of gallery**: once all blocks are loaded, show a centered muted "(N results)" text below the last Block, where N = `totalMedia`. This element also serves as the scroll sentinel and replaces it once the gallery is complete.

## Out of Scope

- Cluster-based layout or dynamic tile spans (rowspan/colspan > 1)
- Preset-controlled column count (always 2×2 for now)
- `GET /api/media/:index` for Player navigation (future spec)
- Retry on error
- Staleness handling when a Scan runs mid-scroll
