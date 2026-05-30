# Temporary Presets

## Description

I want two ways to save presets: temporarily (in-memory on the server, cleared on restart) or permanently (existing SQLite-backed behavior). This lets me experiment with preset configurations without committing them to disk.

### Save buttons

The single "Save" button in the SettingsModal footer is replaced by three equal-weight buttons: "Save Temporarily", "Save Permanently", and "Cancel". Both save buttons close the modal on success; Cancel behavior is unchanged.

### New API endpoint: PUT /api/presets/temp

A new `PUT /api/presets/temp` endpoint saves the entire preset array temporarily. The request body is `{ sessionId?: string, presets: Preset[] }`. If `sessionId` is provided and already exists in the server's in-memory store, the entry is overwritten (same sessionId reused). If not provided, a new sessionId is generated (a random UUID or similar). The response is `{ sessionId: string }`. The server ensures a preset named "default" always exists in the saved array, injecting the hardcoded `DEFAULT_PRESET` if missing — same guarantee as the permanent store.

The server stores temp presets in a `Map<string, Preset[]>` in memory. No TTL, no eviction cap — entries accumulate until server restart.

### GET /api/presets response shape change

`GET /api/presets` now accepts an optional `sessionId` query param and returns `{ presets: Preset[], isTemp: boolean }` instead of a plain array. If `sessionId` is provided and found in the in-memory store, `presets` is the temp array and `isTemp` is `true`. Otherwise, `presets` comes from the DB and `isTemp` is `false`. The same default-preset auto-injection applies to both sources.

### GET /api/blocks: sessionId support

`GET /api/blocks` accepts an optional `sessionId` query param. When present and found in the temp store, `resolvePreset` looks up the preset by name from the temp array instead of the DB. If the sessionId is unknown, fall back to DB as before. If the sessionId is known but the requested preset name isn't found in the temp array, use the temp array's "default" preset. Unknown preset names in the permanent store already fall back to the permanent default — that behavior is unchanged.

### Browser: sessionId lifecycle

The browser stores the sessionId in `sessionStorage` (tab-scoped, independent across tabs). On every API call that involves presets — `GET /api/presets`, `GET /api/blocks`, and the gen-thumbnails/gen-highlights preset dropdown fetches — append `&sessionId=<id>` when a sessionId is present in sessionStorage.

On initial page load, the browser reads sessionId from sessionStorage and sends it with the first `GET /api/presets` call. If the response comes back with `isTemp: false` (e.g. server restarted and lost the temp store), the browser clears the sessionId from sessionStorage so future calls don't send a dead param.

When "Save Permanently" succeeds, the browser clears the sessionId from sessionStorage. The next `GET /api/presets` (triggered by React Query invalidation) will return `isTemp: false`, hiding the temp indicator.

When "Save Temporarily" succeeds, the browser stores the returned `sessionId` in sessionStorage (or keeps the existing one if it was reused).

### Preset modal: temporary indicator

At the top of the Presets tab (not the modal header — only visible when on the Presets tab), show a text label "Using temporary presets" when `isTemp` is `true`. Hide it when `isTemp` is `false`.

### New Preset button replaces Duplicate

The "Duplicate" button in the SettingsModal preset controls is replaced by a "New Preset" button. Instead of copying the currently-selected preset, it always copies the "default" preset. It prompts for a name immediately (same prompt-and-validate flow as the current duplicate handler). If a preset with that name already exists, show the same alert as before.

### Gen-thumbnails / Gen-highlights preset dropdowns

These task configuration preset dropdowns also call `GET /api/presets?sessionId=<id>` and display temp presets when a sessionId is active. However, when a task is actually created, the resolved preset is snapshotted at creation time (the full preset object is stored with the task config) so task execution doesn't need to know about sessionId.

### Frontend wiring summary

- `fetchPresets` returns `{ presets: readonly Preset[], isTemp: boolean }` and accepts an optional `sessionId` argument.
- `fetchBlocks` accepts and forwards an optional `sessionId` argument.
- Gallery.tsx unwraps `data.presets` from the presets query and threads `isTemp` down to SettingsModal.
- SettingsModal receives `isTemp: boolean` and `sessionId: string | null` as props; shows the indicator accordingly; calls the appropriate save function on each button.

## Out of Scope

- Server-side TTL or eviction of stale temp sessions
- Deleting temp entries when saving permanently (stale entries just linger until restart)
- Any visual indicator outside the SettingsModal (e.g. toolbar, player)
- Shared sessions across tabs
