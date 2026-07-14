# Preset and General Settings Revamp

## Description

I want to make UI improvements to the Settings modal, covering both the General tab and the Presets tab, plus corresponding renames to variables and database columns since there's no prod database to migrate.

### General settings

- `tilePct` gets relabeled "Tile % of Screen" (no variable rename).
- A new section is added at the bottom of the General tab called "Letterbox Cropping", containing all 4 crop settings (`tileCropX`, `tileCropY`, `playerCropX`, `playerCropY`), pulled out of their current "Gallery"/"Player" section groupings.
- The old "When Video Ends" setting (`onVidEnd`, a string enum of `loop`/`stop`/`next`) is replaced by a boolean checkbox labeled "Autoplay initially on", stored as `autoplayInitiallyOn` (bool, default `true`). There's no more loop option — this is Player behavior: when the currently playing video ends, if the checkbox is checked, the Player swaps to the next video (equivalent to the old `next` behavior); if unchecked, it stops (equivalent to the old `stop` behavior). This applies for the whole session, not just the first video.
- The old "Video Tile Playback" setting (`autoPlayTile`, a string enum of `off`/`hover`/`always`) is replaced by a boolean `tilePreviewAlways` (default `false`), with the "off" state dropped entirely. The label stays "Video Tile Playback" (not renamed). It's rendered as a 2-option select bound to the boolean: "On Interaction" (false) / "Always" (true) — not a plain checkbox, since it needs two explicit option labels. This will need a small special case in the `settingsFields.ts` field-metadata system since `select` currently assumes string enum values.
- `fallbackToOriginal` gets relabeled "Fallback to Original Video" (no variable rename).

### Presets

- The "Duplicate" preset action is removed entirely (button, `onDuplicate` handler, `presetsStore.duplicatePreset`, `presetsStore.suggestDuplicateName`). Remaining actions are just Rename, Delete, New (Duplicate simply drops out of the middle of the current button order).
- `includeVids` and `includeImages` move onto a single row labeled "Media Type", with a "Video" checkbox and an "Image" checkbox side by side. No variable rename.
- `includePortrait` and `includeLandscape` move onto a single row labeled "Aspect Ratios", same side-by-side pattern. No variable rename.
- `minDuration` and `maxDuration` move onto a single row: two number inputs side by side separated by a dash (`[  ] – [  ]`). Each shows placeholder text "any" when empty. These stay as `int` with default `0` — the UI just displays blank instead of "0" (not a nullable/optional type change).
- `whitelistCSV` label becomes "Whitelist CSV"; `blacklistCSV` label becomes "Blacklist CSV". No variable rename needed since the field names already match.

### Renames requiring backend + frontend + DB updates

- `onVidEnd` (TEXT, string enum) → `autoplayInitiallyOn` (INTEGER/bool), default `true`.
- `autoPlayTile` (TEXT, string enum) → `tilePreviewAlways` (INTEGER/bool), default `false`.
- Update Go structs, SQLite column definitions in the `general_settings` table, and `DefaultGeneralSettings()` (or equivalent) to match.
- Update frontend `types.ts` (drop `OnVidEnd`/`AutoPlayTile` string union types), `settingsFields.ts`, and any default-settings construction on the frontend to match.
- No database migration code needed — there's no prod database yet, so the dev/test DB can just be deleted and recreated with the new schema.

## Out of Scope

- No database migration tooling.
- No changes to preset `basePath`, `whitelistCSV`/`blacklistCSV` variable names (label text only).
- No reordering of remaining preset action buttons beyond removing Duplicate.
- No nullable/optional type change for `minDuration`/`maxDuration`.
