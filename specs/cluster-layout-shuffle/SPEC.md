# Cluster Layout Shuffle

## Description

I want to replace the current flat grid shuffle with a cluster-aware layout algorithm that sizes tiles by aspect ratio and desired screen coverage. This touches the Preset schema, the shared types, the shuffle cache, the blocks API, and the settings UI.

### Preset Changes

Remove `galleryColumns` and `galleryRows` from the Preset. Add two new integer fields:

- `targetTilePercent` (default 25) — desired tile pixel area as a percentage of screen area
- `maxTilePercent` (default 50) — maximum allowed tile pixel area as a percentage of screen area

Both are positive integers with no enforced upper bound beyond sanity. Clamp `clusterCount` to 1–3 (was 1–5).

Drop and recreate the `preset` DB table to reflect these schema changes. Existing preset data does not need to be preserved.

### Block and Tile Shape

Replace the current `TileInfo` fields (`x`, `y`, `rowspan`, `colspan`) with a single `width` field — a positive decimal no greater than 1.0 representing the tile's share of the screen width.

Add an `isFull: boolean` field to `BlockInfo`. A Block is now always a single horizontal row of tiles. When `isFull` is true, each tile's `width` is a weight relative to the other tiles in the block and they collectively fill the full screen width. When `isFull` is false, each tile's `width` is a literal fraction of the screen width.

The `TileInfo` shape therefore becomes: `{ index: number, width: number, preview: PreviewInfo }`.

### Blocks API Changes

When `s` (shuffleId) is not provided, the request must include `w` and `h` integer query params for the device's viewport width and height in pixels. Return 400 if either is missing or invalid. When `s` is provided, `w` and `h` are ignored — the full layout is already cached.

### Shuffle Cache Changes

The cache entry changes from `{ shuffle: PreviewInfo[] }` to `{ blocks: BlockInfo[], media: PreviewInfo[] }`. Both structures are built once during shuffle generation and stored together. `media` is a flat array of all `PreviewInfo` objects in block order (block 0 tile 0, block 0 tile 1, …, block N tile M). Tiles in `blocks` reference `PreviewInfo` objects from `media` by index — they point to the same objects in memory, not copies.

The `GET /api/media-info` endpoint uses `cache.media[index]` instead of `cache.shuffle[index]`. Everything else about that endpoint stays the same.

### Layout Algorithm

The algorithm runs on the server when a new shuffle is generated (no `s` param). It replaces the current Fisher-Yates shuffle and linear grid layout.

**Step 1 — Filter.** Apply SimpleFilter and PresetFilter to get the eligible media pool. If the pool is empty, return `{ shuffleId, totalBlocks: 0, totalMedia: 0, blocks: [] }`.

**Step 2 — Cluster.** Run k-means clustering on the aspect ratios of all filtered media. The number of clusters is `preset.clusterCount`. Each cluster has a set of media items and an average aspect ratio computed as the mean of all its members' aspect ratios.

**Step 3 — Compute CTPB.** For each cluster compute the Cluster Tiles Per Block (CTPB) — an integer between 1 and 10 inclusive. The tile area percent for a candidate CTPB value is:

```
tilePercent = viewportWidth / (CTPB² × avgAspectRatio × viewportHeight)
```

Iterate CTPB from 1 to 10. Choose the value whose `tilePercent` is closest to `targetTilePercent` while still being ≤ `maxTilePercent`. If all values exceed `maxTilePercent`, use CTPB = 10.

**Step 4 — Merge clusters.** If a cluster's CTPB > total cluster count and there is more than one cluster, merge it with the cluster whose average aspect ratio is closest to its own. After merging, recompute the merged cluster's average aspect ratio as the mean of all its members' aspect ratios, then recompute its CTPB. Repeat this check iteratively until all clusters satisfy CTPB ≤ cluster count, or until only one cluster remains. At one cluster, stop — no further merging possible.

**Step 5 — Allocate pure blocks.** For each cluster, randomly shuffle its media items (independent shuffle per cluster). Divide them into complete groups of exactly CTPB items. Each complete group becomes a pure block: `isFull: true`, all tiles have `width = 1 / CTPB`. Any leftover items (count % CTPB ≠ 0) become remainder items. Each remainder item must carry its cluster's CTPB with it.

If there is only one cluster after merging, skip this step entirely — all items are remainder.

**Step 6 — Build pure block list.** Collect all pure blocks from all clusters into a single list and shuffle them randomly. These form the first portion of the final block sequence.

**Step 7 — Fill remainder blocks.** Shuffle the remainder items randomly (preserving each item's associated CTPB). Then iterate through them one at a time, placing each into the current remainder block or starting a new one:

- Each remainder tile has `width = 1 / CTPB` where CTPB is the item's associated cluster CTPB.
- To decide whether a tile goes in the current block or a new block: compare how close the current block's total width is to 1.0 before vs. after adding the tile. If it's closer to 1.0 after adding, add it to the current block; otherwise, seal the current block as `isFull: true` and start a new block with this tile as its first item.
- When a remainder block is sealed mid-fill (not the last one), it is always `isFull: true`.
- After all remainder items are placed, the final remainder block is `isFull: true` only if its total width is ≥ 0.98; otherwise `isFull: false`.

**Step 8 — Assemble final block list.** Concatenate: shuffled pure blocks → full remainder blocks → final remainder block (if any). Assign sequential `index` values starting from 0. Build the flat `media` array by iterating blocks in order. Set global `index` on each tile.

### Settings UI Changes

In the Settings modal's layout section, replace the `galleryColumns` and `galleryRows` selects with two number inputs for `targetTilePercent` and `maxTilePercent`. Change the `clusterCount` select to offer only 1, 2, or 3.

## Out of Scope

- Persisting or migrating existing preset data through this schema change.
- Any change to the Player's navigation logic beyond updating `media-info` to use the new cache structure.
