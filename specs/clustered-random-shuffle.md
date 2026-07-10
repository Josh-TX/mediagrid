# Clustered Random Shuffle

## Description

I want to change how rows are built specifically when `sort=random`. Instead of just shuffling the filtered media flat and packing rows greedily, I want the shuffle to cluster media by aspect ratio first, so that rows tend to contain tiles of similar aspect ratio ("pure rows"), with any leftovers packed into "impure" rows at the very end of the shufflelist.

### Pipeline

1. Take the filtered media list and do a single Fisher-Yates shuffle. This shuffled order is reused for everything downstream (cluster membership order, tile order within pure rows, and the impure pool), so randomness is preserved throughout.
2. Run 1D k-means on each media item's raw `AspectRatio()` value (not log-transformed) to group media into clusters. K is a source-level constant set to 5, clamped to `min(5, len(media))` for small filtered sets. Initialize centroids evenly spread across the min–max aspect ratio range of the filtered set, then run standard Lloyd's algorithm (assign to nearest centroid, recompute centroid as the mean, repeat) until centroids stabilize or a small max-iteration cap is hit.
3. Trust the existing data pipeline for aspect ratio validity — no explicit guard against invalid/zero aspect ratios is added; if bad data reaches clustering that's a pre-existing data problem, not something this feature needs to defend against.

### Dissolving undersized clusters

A cluster is "big enough" only if packing its own (already-shuffled) media via the same row-packing logic used elsewhere produces at least one row that completes because it hit the area threshold or the max-tiles-per-row cap — not because it simply ran out of media. If a cluster can't produce even one such row, it must be dissolved.

Dissolving is iterative and dynamic, smallest-first:
- Repeat: among clusters not yet confirmed as "survivors," pick the currently-smallest one.
- Test it against the "big enough" definition above.
- If it passes, mark it a confirmed survivor and never revisit it.
- If it fails, dissolve it entirely: merge all of its media into whichever other remaining cluster (survivor or not) currently has the closest centroid (by aspect ratio), then recompute that target cluster's centroid as the mean of its full new membership.
- Repeat until every remaining cluster has been confirmed as a survivor (this may cascade — merging can make a previously-insufficient cluster newly sufficient, or change which cluster is nearest for the next dissolve).

This can end with as few as one final surviving cluster, or (for very small filtered sets) end with a single cluster that still isn't big enough — in which case everything falls through to the impure pool, matching today's flat-shuffle behavior as a natural degenerate case.

### Building pure and impure rows

- For each surviving cluster, pack its shuffled media into rows using the existing row-packing logic. Rows that complete via the threshold/max-tiles-per-row cap are "pure rows." Any final trailing row that instead ends because the cluster ran out of media is *not* emitted as a row — its tiles are pulled out and added to a shared impure pool instead.
- Once all surviving clusters have contributed their pure rows, the full set of pure rows across all clusters is fully randomly shuffled (not grouped by cluster, not round-robin) to determine final order.
- All impure-pool tiles (accumulated leftover remainders from every surviving cluster) are then packed into rows using the same row-packing logic, and these impure rows are appended to the very end of the shufflelist, after all pure rows.
- This entire clustering/dissolving/packing pipeline only applies when `sort=random`. Other sort modes (az, date, size) are untouched and continue using the current flat packing behavior.
- No new fields are added to `Row`/`Tile` for cluster membership or purity — this is purely an internal reordering; the frontend renders the resulting row list exactly as it does today, unaware that clustering happened.

## Incomplete-row tile sizing fix

Separately, but related: today, when a row's packing loop stops because media ran out (rather than because the area threshold or max-tiles-per-row was reached), the existing code still stretches that row's tiles to fill the full screen width, which makes those tiles visually much larger than `tilePct` should allow.

This needs to be fixed globally, for any trailing/incomplete row in any sort mode (not just the new impure rows from clustering), since it's really a general correctness issue in the row-packing/sizing logic:

- For a row that ends because media ran out, tile widths must instead be derived directly from a target per-tile area (i.e. solve for the row height that keeps the row's average tile area at/under the `tilePct*screenW*screenH` threshold, same target used for normal rows), then compute each tile's width as `height * aspectRatio` — rather than deriving width by evenly dividing the full screen width across however many tiles happen to be in the row.
- Because this row no longer necessarily spans the full screen width, it should be left-aligned, leaving blank/empty space at the end of the row rather than stretching to fill it.

## Out of Scope

- No changes to caching mechanics (`RandCache`) beyond continuing to cache the resulting row layout the same way it does today.
- No new UI/visual indicators distinguishing pure vs. impure rows.
- No changes to non-random sort modes' row composition/ordering (az/date/size), aside from the shared incomplete-row sizing fix.
