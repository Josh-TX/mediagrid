# Preset Management

## Description

I want to implement full preset management — a SQL-backed `preset` table, backend API, shared types, and a frontend UI for creating, editing, and switching presets.

### Preset Fields

Each preset has the following fields (defaults are defined in the backend only — the frontend must never hardcode them):

| Field                  | Type         | Default | Notes                                                                 |
|------------------------|--------------|---------|-----------------------------------------------------------------------|
| name                   | TEXT PK      | —       | Unique case-insensitively; `"default"` is reserved                    |
| galleryColumns         | INTEGER      | 2       | 1–8                                                                   |
| galleryRows            | INTEGER      | 2       | 1–2                                                                   |
| clusterCount           | INTEGER      | 3       | 1–5                                                                   |
| minAspectRatio         | REAL NULL    | NULL    | Null = no limit                                                       |
| maxAspectRatio         | REAL NULL    | NULL    | Null = no limit                                                       |
| minDuration            | INTEGER NULL | NULL    | Seconds; null = no limit                                              |
| maxDuration            | INTEGER NULL | NULL    | Seconds; null = no limit                                              |
| videoCropMaxX          | REAL         | 0.1     | 0–0.30 in 0.05 steps                                                  |
| videoCropMaxY          | REAL         | 0.1     | 0–0.30 in 0.05 steps                                                  |
| tileCropMaxX           | REAL         | 0.1     | 0–0.30 in 0.05 steps                                                  |
| tileCropMaxY           | REAL         | 0.1     | 0–0.30 in 0.05 steps                                                  |
| excludeContainsCsv     | TEXT NULL    | NULL    | NULL and empty string both mean no filtering; store NULL              |
| excludeNotContainsCsv  | TEXT NULL    | NULL    | NULL and empty string both mean no filtering; store NULL              |
| mediaType              | TEXT         | "all"   | `"all"` \| `"images"` \| `"videos"`                                  |

### Shared Types (`@repo/types`)

Add a `Preset` Effect Schema to `@repo/types` covering all fields above. Defaults are not encoded here — only the shape.

### Backend

**DB:** Create a `preset` table on startup with the fields above. Name is the primary key.

**`GET /api/presets`:** Returns all presets as a JSON array, sorted alphabetically with `"default"` first. If no rows exist, auto-insert the default preset (using backend-defined defaults) before returning. This "ensure default exists" logic runs only here — nowhere else.

**`PUT /api/presets`:** Accepts a full array of presets. Replaces the entire table in a single transaction (delete all, insert all). No validation that `"default"` is present — if it's missing, the next `GET /api/presets` will regenerate it. Returns 200 on success.

**`GET /api/blocks`:** Gains an optional `preset` query param (preset name). If absent or names an unknown preset, silently falls back to the default preset. Looks up the preset from the DB and applies all its filter fields server-side (mediaType, minAspectRatio, maxAspectRatio, minDuration, maxDuration, excludeContainsCsv, excludeNotContainsCsv), in addition to the existing `q` SimpleFilter (AND logic). Uses the preset's `galleryColumns × galleryRows` as the block size instead of the hardcoded 4. Updates `totalBlocks = ceil(totalMedia / (galleryColumns * galleryRows))` accordingly.

### Frontend — Startup

On mount, fetch `GET /api/presets` before fetching any blocks. If this request fails, show a full error state — the app cannot function without presets. Do not hardcode any default preset values in the frontend.

### Frontend — URL State

Both the SimpleFilter and active preset are stored in the browser URL as query params: `?q=search+terms&preset=myPreset`. The `"default"` preset is never written to the URL — remove the `preset` param when default is selected. If the URL contains an unknown preset name, silently fall back to default (no URL cleanup needed since the URL updates live).

### Frontend — Toolbar

The Toolbar now has three elements left to right: search input (SimpleFilter) + preset `<select>` + settings icon. The preset select is styled to match the Toolbar's minimalistic transparent aesthetic (white text, no solid background). It lists all presets alphabetically with `"default"` first.

Changing the preset select in the Toolbar immediately updates the URL (`?preset=...`) and triggers a Gallery refresh (same as SimpleFilter changes).

### Frontend — Gallery Integration

When fetching `GET /api/blocks`, omit the `preset` param entirely when the active preset is `"default"`. Otherwise pass `preset=<name>`. The frontend uses the loaded preset's `galleryColumns` and `galleryRows` to render the grid layout and compute how many blocks to request.

### Frontend — Settings Modal, Presets Tab

The Presets tab replaces the "Coming soon" stub with a full management UI.

**Header row:** A `<select>` listing all presets (alphabetical, `"default"` first) followed by three small icon buttons: Rename, Duplicate, Delete. Rename and Delete are disabled when `"default"` is selected. Switching the select updates the URL live (same as Toolbar select) but the Gallery does not re-render until the modal closes.

- **Rename:** Opens a native `prompt()` for the new name. On name collision (case-insensitive), `alert()` the error — user must try again manually.
- **Duplicate:** Opens a native `prompt()` for the new name. On name collision, `alert()` the error. On success, the new preset is auto-selected in the modal and auto-focused for editing.
- **Delete:** Removes the preset from local state and switches the select to `"default"`.

**Scrollable settings area** grouped into three sections:

- **Layout:** galleryColumns (`<select>` 1–8), galleryRows (`<select>` 1–2), clusterCount (`<select>` 1–5)
- **Filter:** mediaType (`<select>`: All / Images only / Videos only), minAspectRatio (`<select>`), maxAspectRatio (`<select>`), minDuration (number input, seconds, blank = no limit), maxDuration (number input, seconds, blank = no limit), excludeContainsCsv (text input), excludeNotContainsCsv (text input)
- **Cropping:** videoCropMaxX, videoCropMaxY, tileCropMaxX, tileCropMaxY (each a `<select>` with options 0%, 5%, 10%, 15%, 20%, 25%, 30% — stored as 0, 0.05, 0.1, etc.)

Aspect ratio select options (used for both min and max):
- No limit → null
- Very landscape → 2.0 (2/1)
- Slightly landscape → 1.33 (4/3)
- Square → 1.0 (1/1)
- Slightly portrait → 0.75 (3/4)
- Very portrait → 0.5 (1/2)

Display each option's label with its ratio in parentheses, e.g. "Slightly portrait (3/4)".

**Sticky footer:** Save and Cancel buttons, always visible below the scrollable area.

- **Save:** Calls `PUT /api/presets` with the full local preset array. On success: close modal (Gallery refreshes with the selected preset). On failure: show an error (alert or toast), keep the modal open.
- **Cancel:** Discards all field edits. Close modal (Gallery refreshes with the selected preset).

All edits (field changes, renames, duplicates, deletes) are purely local React state until Save is clicked.

## Out of Scope

- Cluster-based layout logic (clusterCount is persisted but not yet used for layout)
- Player implementation
- Thumbnail-gen / Highlight-gen / Clean tasks
- Retry on `PUT /api/presets` failure
- Reordering presets
- Creating a blank preset (duplicate is the only way to create one)
