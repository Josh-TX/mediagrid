# Gallery Scroll Sync

## Description

Right now the Gallery keeps whatever scroll position it had before the Player was opened, even as the Player swaps between media. I want the Gallery's scroll position to track the Player instead, so that when the Player closes, the Gallery is already scrolled to the right spot — no scroll-into-view jump needed on close.

There are two scenarios to handle, both driven by fixed per-row pixel heights (`row.h`, varying row-to-row based on aspect-ratio layout, but fixed for any given row instance) and the existing `offsets` prefix-sum array in `Gallery.vue` that maps a row index to its cumulative top-offset in px.

**Scenario 1 — Player opened by tapping a tile.** Capture an anchor the moment the Player opens: the Gallery's current `scrollTop` and the row index of the tapped tile. On every subsequent swap, recompute (not incrementally accumulate) `scrollTop = max(0, anchorScrollTop + (offsets[currentRowIndex] - offsets[anchorRowIndex]))`. Example: scrollTop is 800, tapped tile is in row 4, user swaps to a tile in row 5, row 4's height is 300px → new scrollTop is 1100.

**Scenario 2 — Player opened via direct load / refresh (URL has `i` param).** Once the target row's data has arrived (rows load asynchronously via `resetWithTakei`), compute an initial anchor so the selected tile's row sits 100px below the viewport top: `anchorScrollTop = max(0, offsets[rowIndex] - 100)`, `anchorRowIndex = rowIndex`. From that point on, subsequent swaps behave exactly like scenario 1's per-swap delta formula against this anchor.

**Clamping**: only clamp the lower bound (`scrollTop >= 0`). Do not clamp an upper bound — trust that prefetch (`PREFETCH_ROW_BUFFER`) keeps enough rows loaded ahead of the current index, and let the browser's native scroll clamping handle any edge overshoot visually.

**Animation**: scrollTop changes are instant (a snap), no smooth-scroll/animation.

**Ownership and structure**: this logic lives entirely in `Gallery.vue` — no new store, no event bus, no changes to `urlStore`. It's implemented as two watchers:

1. A watcher on `playerStore.state.openMode` (a new field, `'tap' | 'direct' | null`, set by `playerStore.open()` and `playerStore.openDirect()` respectively) that fires once per Player-open and establishes the anchor — for `'tap'` it captures immediately (current `scrollTop` + tapped row); for `'direct'` it waits until row data for the target tile has loaded, then computes the `offsets[rowIndex] - 100` anchor. This watcher must not re-fire mid-session (i.e., not on every swap).
2. A watcher on `playerStore.state.currentIndex` that fires on every swap and applies the delta formula against whatever anchor is currently set, using the existing `rowIndexForTileIndex` helper in `playerStore` to map the flat tile index to a row index.

No special handling is needed when the Player closes — because scrollTop is kept continuously correct throughout the Player session, the Gallery is already positioned correctly the moment it becomes visible again.

## Out of Scope

- Smooth/animated scrolling — snap only.
- Upper-bound scroll clamping.
- Changes to `urlStore`, creation of a new Pinia-style store, or an event bus.
