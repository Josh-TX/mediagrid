# Gallery Sort

## Description

I want to add a sort-by control to the Gallery. Currently the shuffle is always random (cluster-based aspect-ratio shuffle). I want four sort options:

- **random** — existing behavior: cluster k-means, pure blocks, remainder packing
- **size** — sort by `filesize` field ascending/descending
- **A-Z** — sort alphabetically by full file path
- **date** — sort by `mdate` (file modification date)

### Toolbar layout

The Toolbar changes from `[search] [preset select] [settings]` to:

```
[search] [sort-direction icon] [sort select] [preset select] [settings]
```

The sort-direction icon sits immediately to the left of the sort `<select>`. Its appearance and behavior depend on the active sort:

- **sort = random**: show a dice icon. Clicking it resets the `shuffleId` (re-shuffles), the same way changing search or preset does today.
- **sort = non-random**: show an arrow icon. ↑ when ascending, ↓ when descending. Clicking toggles direction.

### State and URL params

Sort type and direction are ephemeral — stored in URL params only, not persisted in the Preset. URL params: `sort` (values: `random`, `size`, `az`, `date`) and `dir` (`asc` or `desc`). Both default to `random`/`asc` when absent. When sort or direction changes, the `shuffleId` is reset (triggers a new shuffle on next block fetch), the same as when search or preset changes.

Default sort is `random` (existing behavior). When switching to any non-random sort for the first time, default direction is `asc`.

### Backend API changes

Two new optional query params on `GET /api/blocks` for the initial request (no `s` param): `sort` and `dir`. These are ignored when `s` is provided — the cached layout is used as-is. The backend sorts media before building the layout, then stores the result in the shuffle cache under a new `shuffleId`. All subsequent block and `media-info` requests use the `shuffleId` unchanged, so the Player requires no changes.

When `sort=random` or `sort` is absent, the existing `buildShuffleLayout` cluster logic is used unchanged.

### Non-random layout algorithm

When sort is not random, a new layout function replaces `buildShuffleLayout`. The filtered media pool is sorted by the requested field and direction, then blocks are constructed greedily using the following per-tile algorithm.

**Tile width formula:**

```
tileWidthFraction = sqrt(targetTilePercent × vpW × vpH × mediaAR) / vpW
```

where `mediaAR = width / height`. This gives each tile the width such that, if it were alone in a block at its natural height, its area would equal `targetTilePercent × vpW × vpH`. `targetTilePercent` and `maxTilePercent` come from the active Preset, same as the random layout.

**Block packing:** Iterate over sorted media items in order. For each item:

1. **Max tile check (priority):** If closing the current block now — without this tile — would normalize any existing tile's effective width above `maxTilePercent` (i.e. `max(existingRawWidths) / currentSum > maxTilePercent`), force-add this tile to the current block regardless of sum direction. This prevents existing tiles from being over-inflated on normalization.
2. **Closer-to-100% check:** Otherwise, add this tile to the current block if `|currentSum + tileWidth - 1| ≤ |currentSum - 1|`; else seal the current block and start a new one with this tile.

Note: since all tiles are sized from the same area formula, all tiles in a block have approximately equal raw area, so the max tile check effectively asks whether the block has too few tiles to keep them all under max.

**isFull logic:** A block is `isFull = true` if its raw tile widths sum to > 1.0 (tiles are normalized to sum to 1.0 for display). Otherwise `isFull = false` and raw widths are kept as-is. All blocks except potentially the last are expected to be full in typical usage. The last block is full if and only if its sum exceeds 1.0. If a single tile's raw width exceeds 1.0 (e.g. a very wide panoramic), it naturally becomes a solo full block — no special casing needed.

## Out of Scope

- Persisting sort preference in the Preset
- Any changes to the Player component
- Sorting within the random layout (random always uses the existing cluster shuffle)
