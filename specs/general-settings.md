# General Settings

## Description

Right now every setting (Gallery, Filter, Player) lives inside a "Preset," so switching presets changes things that should really be global. I want to split this apart: Gallery and Player settings become a single global "General Settings" object, separate from Presets. Presets keep only what used to be the "Filter" section — and since that's now the *only* thing a preset contains, we drop the "Filter" branding entirely; it's just "the preset settings."

One consequence: `defaultSort` currently lives in the per-preset Gallery section. Since Gallery moves to General, `defaultSort` becomes a single global value shared by all presets (not overridable per-preset).

### Data model split

- **General Settings** (new, global, singleton): everything currently in the Preset's Gallery section (`tilePct`, `tileCropX`, `tileCropY`, `defaultSort`, `autoPlayTile`, `fallbackToOriginal`) and everything currently in the Preset's Player section (`onVidEnd`, `playerCropX`, `playerCropY`, `rewindSeconds`, `forwardSeconds`).
- **Preset** (existing concept, narrowed): keeps `Name` plus everything currently in the Filter section (`includeVids`, `includeImages`, `includePortrait`, `includeLandscape`, `minDuration`, `maxDuration`, `whitelistCSV`, `blacklistCSV`, `basePath`). No behavior change to these fields, just no more "Filter" label — they're simply "the preset settings" now.

### Backend

- New `general_settings` SQLite table, structured like the existing `presets` table (one column per field, matching column-per-field style), but holding a single row (e.g. `id INTEGER PRIMARY KEY CHECK (id=1)`).
- The `presets` table drops the Gallery and Player columns, keeping only Name + Filter columns.
- No migration code needed — there are no real deployments yet; the test DB will just be deleted and recreated.
- If the `general_settings` row doesn't exist yet (fresh DB), `GET /api/settings` synthesizes a default general settings object in-memory on read, the same way `GET /api/presets` currently synthesizes a default preset named `"default"` when one is missing.
- Routes:
  - `GET /api/presets` is replaced by `GET /api/settings`, which returns `{ general: GeneralSettings, presets: Preset[] }`. This is called once at startup (from wherever `presetsStore.load()` is currently invoked in `urlStore.init()`), replacing the old `GET /api/presets` startup call.
  - `POST /api/presets` stays exactly as-is (still takes/replaces the full `Preset[]` array, now just with fewer fields per preset).
  - New `POST /api/general-settings` takes the full `GeneralSettings` object in the request body and replaces the single stored row (full-replace semantics, same pattern as `POST /api/presets`, just not an array).

### Frontend state

- New separate `generalSettingsStore.ts`, structured like `presetsStore.ts`: holds `serverGeneral` (last-fetched/saved baseline) and `activeGeneral` (live editable copy), with `load()`, `revert()`, `savePermanently()`.
- Only one `GET /api/settings` call happens at startup. It's used to populate both `presetsStore` and `generalSettingsStore` (e.g. `presetsStore.load(data.presets)` and `generalSettingsStore.load(data.general)`), rather than each store independently fetching.
- `generalSettingsStore` mirrors the existing "Temp Preset" sessionStorage behavior: edits to `activeGeneral` are persisted to a new sessionStorage key (e.g. `mediagrid_temp_general`) so they survive a page refresh before being saved, restored on `load()` if present, and cleared on revert/save — same pattern as `mediagrid_temp_presets`.
- **Dirty tracking (new, applies to both stores)**: each store exposes an `isDirty` computed value, computed as `JSON.stringify(active) !== JSON.stringify(server)`. This replaces the current "always enabled" behavior — the Revert and Save Permanently buttons on both the General tab and the Presets tab should be disabled unless their respective tab is dirty.
- Closing the Settings modal (X button or overlay click) does not warn about unsaved changes, and does not auto-revert — same as today. No visual "unsaved" indicator on the tab itself is needed.

### Settings modal UI

- Tabs become "modern" underline-style tabs (flat text labels, active tab gets a colored bottom-border/underline indicator) instead of the current plain buttons.
- Three tabs, in this order: **General** (new, leftmost, default tab when the modal opens), **Presets** (existing, narrowed to just the former Filter fields), **Tasks** (existing, unchanged).
- **General tab**: renders the Gallery and Player fields, each under their own sub-header ("Gallery" and "Player"), same visual grouping pattern as today, minus "Filter". Has its own Revert / Save Permanently footer, wired to `generalSettingsStore`, disabled when not dirty.
- **Presets tab**: keeps the existing preset selector dropdown + Rename/Duplicate/Delete/New controls. The fields (formerly under a "Filter" h3 header) are now rendered directly with no section header, since the whole tab is just preset settings now. Keeps its Revert / Save Permanently footer, wired to `presetsStore`, disabled when not dirty.
- The `settingsFields.ts` field-metadata source needs to be split accordingly: general fields (Gallery + Player groupings) vs preset fields (flat list, no grouping/header).
- Modal close button: replace the current `×` text button styling — keep the `×` character, but make it bold, remove any visible button background/border, and add a hover effect. No SVG icon or icon library needed.

## Out of Scope

- No database migration tooling — the dev/test DB is deleted and recreated from scratch.
- No per-preset override of `defaultSort` (or any other now-general field) — it's fully global.
- No confirmation dialog or unsaved-changes warning when closing the Settings modal.
- No changes to the Tasks tab.
