# URL State

## Description

I want to add basic URL state so that browser refresh, bookmarking, and native back/forward work seamlessly with the Gallery and Player, without ever triggering a full page reload during normal in-app navigation.

### URL params

- `i` — the raw (0-indexed) `tilei` of the Media currently open in the Player. Absent when the Player is closed.
- `p` — the selected preset name. Only present when it differs from `"default"`.
- `sort` — the current sort type. Only present when it differs from the selected preset's `defaultSort`.
- `sortDir` — the current sort direction. Only present when it differs from that sort type's natural/default direction (the existing `defaultDirFor` logic in `uiStore`: `desc` for `size`/`date`, `asc` otherwise).
- `f` — the simple filter text. Only present when non-empty.

Only our known keys (`i`, `p`, `sort`, `sortDir`, `f`) are ever read/written; any unrelated query params present in the URL are left untouched.

### History semantics

- Tapping a Tile to open the Player sets `i` via `pushState`.
- Every other distinct user-initiated change that affects `p`/`sort`/`sortDir`/`f` (selecting a preset, changing sort type, toggling sort direction, committing a filter-text edit) also does a `pushState`. Typing into the filter box only updates the URL once the existing 300ms debounce fires (not per keystroke) — this is why most URL changes should be push, not replace.
- When a single user action changes multiple URL-relevant fields at once (e.g. switching presets also resets `sort`/`sortDir` to the new preset's default), all the changes are batched into one `pushState`, not several.
- When the Player swaps to a different Media (swipe, wheel, keyboard, or `onVidEnd: 'next'`), `i` is updated via `replaceState`, not `pushState`.
- `useNativeBack` is an in-memory (not persisted) boolean flag, not tied to any single store necessarily but conceptually owned by the new URL-sync module. It starts `false` on every fresh page load. It becomes `true` the moment the app performs its first `pushState` of the session (which includes the tile-tap-open case), and then stays `true` for the rest of that page's lifetime.
  - When `useNativeBack` is `true`, closing the Player (via the Hud back button or the `Escape` key) calls real `history.back()`, relying on the guarantee that whatever pushed the current entry left a valid prior in-app entry behind it.
  - When `useNativeBack` is `false` (only possible right after a direct load/refresh with `i` already in the URL), closing the Player instead manually strips `i` from the URL itself via `pushState` (not `replaceState`) — this preserves the original direct-load URL as a history entry, so a subsequent native back from the resulting gallery view returns to it and reopens the Player, and further interactions naturally flip `useNativeBack` to `true` from then on.

### Responding to URL changes

Any time the URL changes for a reason we didn't just initiate ourselves — the user editing query params directly and hitting enter (full reload, handled as initial load), or native back/forward (`popstate`, no reload) — the app must resync its state to match the new URL. This covers:
- `p`/`sort`/`sortDir`/`f` changing: apply to `presetsStore`/`uiStore` and refetch the Gallery (same as the existing manual-change flow), same batching as above where relevant. An unrecognized `p` value falls back to `"default"`, matching the existing `pickInitialSelectedName` behavior (which currently uses the param name `preset` — this gets renamed to `p` as part of this work).
- `i` appearing/disappearing/changing: open/close the Player or update its current index accordingly.
  - If the target tile isn't yet in `galleryStore.state.rows` (e.g. navigating forward to a tile beyond what's currently loaded), fetch more rows to cover it before updating the Player — using the same `skipr`/`taker`/`takei` mechanism as a direct load, but with `skipr = current rows.length` (append onto the existing rows, mirroring how `loadMore()` already works) rather than refetching from scratch.
  - If a `popstate`-driven index change lands on a tile that isn't adjacent to the current one, the Player jumps to it instantly with no swap animation (it's not a swipe gesture).
  - If, after resolving the fetch, the target `i` turns out to be out of range of the shufflelist (`i < 0` or `i >= totalTiles`), close the Player, show a toast reading "invalid media index", and correct the URL by stripping `i` via `replaceState`.
- Because `popstate` can fire rapidly (back-button spam) and trigger overlapping async fetches, the URL-sync logic must guard against stale/out-of-order responses clobbering newer state — e.g. via a request generation counter, discarding any response that isn't from the latest request.

### Direct load (refresh or bookmark navigation with `i` present)

When the page loads with an `i` query param already present, the Player must open immediately with no slide-in animation, and the Gallery underneath must never load or render any tile previews (not even briefly) until the Player is closed.

This is achieved with a single shared `/api/shuffle` fetch, not two separate fetches:
- Backend: `minr`/`maxr` are renamed to `skipr`/`taker` everywhere (including the existing `loadMore()` pagination, which has nothing to do with the Player) for a single consistent pagination vocabulary. A new optional `takei` param can be combined with `skipr`/`taker`: the server returns rows from `skipr` through `max(skipr + taker, rowIndexContaining(takei) + 1)` — i.e. at least `taker` rows, extended further if needed to also include the row containing `takei`. As before, it never returns an incomplete/partial row, and `takei` beyond the available tiles is simply clamped (all available rows returned) rather than erroring — validity is determined client-side via the returned `totalTiles`.
- Frontend: on direct load with `i` present, call `/api/shuffle` with `skipr=0`, `taker=20` (the normal first-page size), and `takei = i + 3` (so a few tiles past the target are already loaded too). The response populates `galleryStore.state.rows`/`totalRows`/`totalTiles` directly — the Gallery mounts immediately using these rows (so it's instantly ready when the Player eventually closes), with its tile previews suppressed via the same mechanism `previewsHidden` already uses today (full unmount of the `<img>`/`<video>`, not just a CSS hide) — except applied eagerly from the very first render rather than only after the open-transition ends. Because the Player is already open (`state.open = true`) on the very first render, Vue's existing `<Transition>` around it naturally does not animate (no `appear` prop set) — no special-casing needed there.
- While this fetch is in-flight, show a black full-screen loading state (not the existing white-background "Loading..." gallery overlay), since we're headed straight into the Player, not the gallery.
- If the resolved `i` turns out invalid (`totalTiles`-based check as above), close the Player before it's ever shown, display the toast, and correct the URL.

### Toast system

Build a small reusable toast system now, in anticipation of future toasts (this codebase currently has none):
- A single active toast slot (a new toast replaces whatever's currently showing), not a stacked queue.
- Auto-dismisses after ~3 seconds, and is also dismissible by tapping it.
- Structured as a minimal store (e.g. `toastStore.ts`, following the existing hand-rolled `reactive()` store convention) plus a small `Toast.vue` component, rather than an ad-hoc `alert()` or inline banner.

### Architecture

- The popstate listener, URL-building/parsing, and cross-store coordination (between `presetsStore`, `uiStore`, `playerStore`, `galleryStore`) live in a new dedicated module (e.g. `urlStore.ts`), following the same hand-rolled store convention as the rest of `stores/`, rather than being embedded directly in `App.vue`.
- `presetsStore`'s existing ad-hoc `preset` query param / `replaceState` logic (`selectPreset`) is superseded by this new module and renamed to `p` per the rules above.

### Testing

This feature should come with test coverage matching the existing conventions: a new `urlStore.test.ts` (mirroring `playerStore.test.ts`/`presetsStore.test.ts`/`uiStore.test.ts`) plus backend Go tests covering the `skipr`/`taker`/`takei` row-range resolution logic (mirroring the existing `layout_test.go`/`cluster_test.go` style).
