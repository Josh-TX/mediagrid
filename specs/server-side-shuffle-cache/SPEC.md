# Server-Side Shuffle Cache

## Description

I want to replace the current seed-based stateless shuffle with a server-side in-memory shuffle cache. The `Seed (r)` concept and `mulberry32`/`seededShuffle` implementation are eliminated entirely. The backend now owns the shuffle: it generates it once, stores it in memory, and hands the client an opaque `shuffleId` to reference it on future requests.

### Backend: Shuffle Cache

The shuffle cache is a plain `Map<number, { shuffle: Media[], lastAccessed: number }>` stored as a module-level singleton. The shuffleId key is a random 6-digit integer (100000–999999). A `setInterval` sweep runs every few minutes and removes any entry whose `lastAccessed` is more than 1 hour old. Every read of a cached shuffle updates `lastAccessed` (sliding expiry).

When generating a new shuffleId, check for collision with existing keys and regenerate if needed (extremely rare with ~900k keyspace and low concurrency).

### Backend: `/api/blocks` Changes

Remove the `r` query param entirely. Add an optional `s` (shuffleId) query param.

- **`s` absent**: generate a fresh shuffle from the current `q`/`preset` filter params, store it in the cache, and return a new shuffleId. The response payload gains a `shuffleId: number` field alongside the existing `totalBlocks`, `totalMedia`, and `blocks`.
- **`s` present and found**: use the cached shuffle directly (ignore any `q`/`preset` params silently). Update `lastAccessed`. Return the same `shuffleId` in the response.
- **`s` present and not found**: return HTTP 404.

The `indices` param and response structure are otherwise unchanged.

### Backend: `/api/media-info` Changes

Remove the `r`, `q`, and `preset` params. The `s` param is now the only way to identify the shuffle — it is effectively required (if absent or not found, return 404). Never generate a new shuffle from this endpoint. Do not include `shuffleId` in the response.

### Backend: `shuffle.ts`

Remove `mulberry32` and `seededShuffle`. Replace with a plain `shuffle<T>(arr: T[]): T[]` using `Math.random()` and Fisher-Yates.

### Frontend: `shuffleId` State and URL

The Gallery component holds `shuffleId` in `useState<number | null>`. On mount, read the `s` URL query param; if present, initialize state from it. Whenever `shuffleId` state changes, sync it to `?s=` in the URL via `window.history.replaceState` (don't push a new history entry). When `shuffleId` is cleared, remove the `s` param from the URL.

### Frontend: TanStack Infinite Query

The query key becomes `["blocks", debouncedSearch, activePreset]` — no shuffleId in the key, since the shuffleId is threaded through the fetch function via the `shuffleId` state ref, not through the key. The `gcTime` stays 0.

On mount (or after a reset), the first `queryFn` call has no `s` — it calls `fetchBlocks` with `shuffleId: null`, which sends only `q`/`preset`. The response includes a `shuffleId`; immediately write it to state (and thus to the URL) before any further fetches.

Gate `fetchNextPage` (and hide the scroll trigger) until `shuffleId` state is non-null. This prevents a race where the user scrolls before the first response arrives, which would otherwise fire a second shuffle-generating request.

When `debouncedSearch` or `activePreset` changes: clear `shuffleId` state (and URL param) and reset the TanStack query so it re-fetches from block 0 with no `s`.

### Frontend: 404 Handling

Both Gallery (block fetches) and Player (media-info fetches) must handle 404 responses:

- Clear `shuffleId` state and URL param
- Reset/invalidate the TanStack infinite query
- Close the Player if open, returning to the Gallery
- Re-fetch from block 0 with no `s` (which generates a new shuffle)

### Frontend: API Function Signatures

`fetchBlocks(shuffleId: number | null, indices: number[], query?: string, preset?: string)`: when `shuffleId` is non-null, send only `s=<shuffleId>` (omit `q`/`preset`); when null, send `q`/`preset` (omit `s`).

`fetchMediaInfo(shuffleId: number, indexes: number[])`: always sends `s=<shuffleId>`, never `q`/`preset`.

The `BlockResponse` schema gains a `shuffleId: number` field.

### Frontend: Player

The Player receives `shuffleId: number` as a prop instead of `seed`. All `fetchMediaInfo` calls use it. If a `fetchMediaInfo` call returns 404, trigger the same reset flow described above.

## Out of Scope

- Viewport dimensions as part of shuffle input (planned future feature — do not implement)
- Persisting the shuffle cache across server restarts
- Multi-user collision handling beyond the simple regenerate-on-collision check
