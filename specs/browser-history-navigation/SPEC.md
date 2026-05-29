# Browser History Navigation

## Description

I want the browser's URL to fully represent the current application state — including whether the Player is open and which index it's at — so that the browser's native back/forward buttons work for navigation.

### URL shape

Add an `i` query parameter for the player's current index (e.g. `?s=123&i=5`). It is only present when the Player is open. All other existing params (`q`, `preset`, `s`, `sort`, `dir`) remain unchanged.

### pushState vs replaceState

The current code uses a single `useEffect` that always calls `history.replaceState`. This must be replaced by moving URL writes directly into each event handler, so each can choose push or replace explicitly.

**pushState** on:
- Opening the Player (tile click)
- Closing the Player via the X button or Escape key
- Reshuffle
- Sort change
- Sort direction toggle
- Preset change (both toolbar dropdown and settings modal)
- Debounced search change (fires 400ms after the user stops typing, as it does today)

**replaceState** on:
- Player index navigation (swiping to next/prev video)
- Server assigning a new shuffleId (transitioning from `shuffleId === null` to a value)
- `handleShuffleExpired` closing the player (error recovery, not user navigation)
- Initial page load (the existing URL is already the right state)

### Player writes its own URL

The Player component manages its own `currentIndex` internally. Rather than lifting that state up to Gallery, Player should call `history.replaceState` directly whenever `currentIndex` changes. It needs access to the current full URL params (shuffleId, q, preset, sort, dir) to reconstruct the query string — these can be passed in as props or read from `window.location.search` at write time.

### Popstate listener

A `popstate` event listener must be added (in Gallery) to sync React state from the URL when the user navigates back or forward. When popstate fires:

- Read all params from the new URL (`q`, `preset`, `s`, `sort`, `dir`, `i`).
- Update all relevant React state: `search`, `debouncedSearch` (both set immediately, bypassing debounce), `activePreset`, `shuffleId`, `sort`, `dir`.
- If `i` is present, dispatch `{ type: 'open', index: i }` to open the Player at that index.
- If `i` is absent, dispatch `{ type: 'close' }` to close the Player.

Both back and forward navigation must work symmetrically via this listener.

### Page refresh with Player open

On initial load, if the URL contains both `s` and `i` params, initialize `playerState` as `{ open: true, index: i, sessionKey: 0 }` so the Player opens immediately. If the shuffleId is expired (server returns 404), the existing `handleShuffleExpired` path already handles recovery — no special handling needed.

### Settings modal

`SettingsModal` has its own `writeUrlPreset` function that currently calls `replaceState`. It must be updated to `pushState` when the preset selection actually changes.

## Out of Scope

- Persisting scroll position in the Gallery across back/forward navigation.
- Handling `popstate` for the Settings modal (it doesn't affect URL).
