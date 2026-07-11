# Settings Tasks Tab

## Description

The Settings modal is getting more complicated, so it's being split into two tabs: **Presets** and **Tasks**. Everything currently in the Settings modal becomes the Presets tab, unchanged in behavior. The top of the modal shows the two tab controls, with a close button in the top-right corner. The modal overlay becomes closable by touching/clicking it (it currently isn't). This is the first tabbed UI in the app and the first polling-based UI in the app, so both patterns are being introduced fresh.

### Tasks tab layout

The Tasks tab has four sections, in this order: **Trigger Tasks**, **Active Tasks**, **Queue**, **Recent Tasks**.

**Trigger Tasks** has 4 buttons: "Scan", "Scan + Clean", "Gen Thumbnails", "Gen Highlights". Buttons are always clickable (no disabled/badge state) — clicking always enqueues another task, even if an identical one is already active or queued (duplicates are allowed and expected, e.g. queuing a second "Scan" while one is already running/queued is fine). The two Gen buttons open a small inner modal with generation settings plus "Cancel" and "Generate" buttons. Clicking "Generate" saves the settings and submits the task, then closes the inner modal immediately, returning to the Tasks tab. Clicking outside the outer modal's overlay while the inner modal is open closes only the inner modal, not the outer one.

**Active Tasks** shows the single currently-running task (only one task runs at a time, globally, across all task types): `<task-name> <task-runtime> <num-processed>/<total-to-process> <cancel-button>`.

**Queue** shows tasks waiting to run, ordered with the next-up task at the top (FIFO). Each entry shows: task name, how long it's been queued (e.g. "30s"), and a cancel/remove button. Queued tasks have no progress numbers since they haven't started.

**Recent Tasks** shows up to the last 10 completed/cancelled/failed tasks (across all types, oldest dropped first). Each entry shows: task name, status (completed/cancelled/failed), final count (processed/total), how long it ran, and a finished-at timestamp (e.g. "2 min ago"). A task cancelled while still in the Queue (never started) does **not** appear in Recent Tasks — only tasks that actually started show up there.

Cancelling a task (active or queued) happens immediately with no confirmation dialog.

The frontend polls `GET /api/tasks` every 1 second whenever the Tasks tab is open, for near-live updates.

### Task queue architecture (backend)

There's no existing task/job/queue concept in the backend today — this is built from scratch. A single background worker goroutine consumes an in-memory FIFO queue; API handlers enqueue a task and return immediately. Tasks, active/queued/recent state, all live in memory only — nothing is persisted to sqlite, and everything is lost on server restart.

Each task gets a unique `TaskId` (assigned at enqueue time, whether it becomes active immediately or sits in queue). There's a `POST /api/tasks/{id}/cancel` endpoint that works whether the task is active or still queued:
- If queued: it's simply removed from the queue (never runs, doesn't appear in Recent Tasks).
- If active: cancellation is cooperative — the current in-flight item (e.g. an in-progress `ffprobe`/`ffmpeg` subprocess) is allowed to finish, then the task stops before starting the next item. It then appears in Recent Tasks with status "cancelled" and whatever partial progress it made.

When an individual item within a task fails (e.g. `ffprobe` errors on a corrupt file, or `ffmpeg` fails to generate a preview for one file), the task logs it server-side, skips the item, and continues — the item still counts toward "processed", and a running failure count is tracked and surfaced in the task's status (e.g. "42/100 (2 failed)").

### Task types

**Scan** — same behavior as the existing on-startup scan (`filepath.WalkDir` over `MEDIA_ROOT`, skip already-known files, `ffprobe` each new file, insert into the `media` table), but now triggerable on demand via `GET /api/scan` (optional `clean` query param), returns immediately, and reports live progress. To get progress numbers, do a first pass walking the tree to count files needing `ffprobe` (i.e. not already in the DB) for `total-to-process`, then a second pass doing the actual work while incrementing `num-processed`. Redundant filesystem walking is fine for this.

**Scan + Clean** — runs a quick clean pre-step first (not counted in the progress numbers, since it's fast), then runs a normal Scan. Clean: find `media` rows whose underlying file no longer exists on disk, delete those rows, and for each deleted row also delete its corresponding thumbnail/highlight preview files if they exist (targeted deletion tied to the specific removed paths — not a full sweep of `PREVIEW_ROOT` for orphans).

**Gen Thumbnails** / **Gen Highlights** — triggered via `POST /api/gen-thumbnails` / `POST /api/gen-highlights`, return immediately. The set of media needing generation is determined by querying sqlite for media matching the task's filter, where "already has a preview" is checked directly via `os.Stat` on the deterministic output path (no DB column needed) unless "Override" is checked, in which case all matching media is regenerated. `total-to-process` is the count of matching media.

### Gen Thumbnails inner modal

Fields:
- **Webp quality** — defaults to 50.
- **Resolution** — `<select>` with options 300x300, 400x400, 500x500, 600x600 (default), 700x700, 800x800, 1000x1000. Underlying stored value is `targetPixels`, the product (defaults to 360000).
- **Override** — checkbox; when checked, regenerates thumbnails even for media that already has one.
- **Filter** — a SimpleFilter (same free-text, space-delimited, AND-substring-match-on-path input as the Toolbar's filter), scoping which media the task applies to.
- **Preset Filter** — checkbox "Use Preset Filter"; when checked, shows a preset dropdown (the task's PresetFilter is that preset's whitelist/blacklist/aspect-ratio/duration/base-path filters); when unchecked, PresetFilter is null. When checked, the dropdown defaults to the user's currently-selected preset (SelectedPreset).

Thumbnails are generated for both images and videos, via `ffmpeg` (available on the host) for both — no separate Go image library. For videos, extract a frame from the middle of the video. Output dimensions are the closest values that preserve the source aspect ratio while multiplying to approximately `targetPixels`, with each dimension rounded to the nearest **even** integer (needed for `ffmpeg`/`libx264`-style encoding constraints, applied uniformly to both webp and mp4 outputs for consistency).

### Gen Highlights inner modal

Fields:
- **Resolution** — same as thumbnails (`targetPixels`).
- **Override** — same as thumbnails.
- **Segment count** — number of segments each highlight should have.
- **Segment duration** — duration of each segment.
- **Max proportion** — limits segment count on shorter videos; a video must be `N * segmentDuration * maxProportion` long to support `N` segments. Defaults to 3.
- **ffmpeg arg** — defaults to `-c:v libx264 -crf 25 -preset fast` (corrected from a typo in early discussion — must be `-c:v`, not `-cv`).
- **Filter** — same as thumbnails.
- **Preset Filter** — same as thumbnails.

Three dynamically calculated, read-only info fields shown in the modal:
- Max highlight duration = segment count × segment duration.
- Min video duration for 1 segment = segment duration × max proportion.
- Min video duration for all segments = max highlight duration × max proportion.

Highlights are only generated for videos (never images). Generation logic (intentionally simplified — a more sophisticated multi-segment-from-various-parts approach is future work):
1. For a given video, find the largest `N` (capped at the configured segment count, minimum 1) such that the video's duration ≥ `N * segmentDuration * maxProportion`.
2. If even `N = 1` doesn't fit (video too short), skip the video entirely — it doesn't count toward `total-to-process` and produces no output.
3. The highlight's duration is `N * segmentDuration`.
4. Extract a single continuous section of that duration from the middle of the source video via `ffmpeg`, scaled to the resolution setting (same even-rounding rule as thumbnails), with audio stripped (`-an`) — highlights are silent, muted-style previews.

### Storage & config

**`PREVIEW_ROOT`** — new required env var config (fatal at startup if unset, following the same pattern as `MEDIA_ROOT`). Contains exactly two subfolders, `thumbnails` and `highlights`, auto-created at startup if missing.

- Thumbnail path: `PREVIEW_ROOT/thumbnails/<media-relative-path>.webp` (e.g. `MEDIA_ROOT/mypath/myvid.mp4` → `PREVIEW_ROOT/thumbnails/mypath/myvid.mp4.webp`).
- Highlight path: `PREVIEW_ROOT/highlights/<media-relative-path>.mp4` (e.g. `MEDIA_ROOT/mypath/myvid.mp4` → `PREVIEW_ROOT/highlights/mypath/myvid.mp4.mp4` — `.mp4` is appended even when the source already ends in `.mp4`).

**`GenSettings` sqlite table** — a new table holding exactly 0 or 1 rows, with two columns: `thumbnail_settings` and `highlight_settings`, each a JSON blob of that inner modal's field values (including the Preset Filter checkbox state and selected preset name/reference). Every time a generate task is submitted (i.e. the "Generate" button is clicked and the API is hit — regardless of whether the resulting task ends up duplicating an already-active/queued one, since duplicates are allowed), the whole row is upserted with the latest settings.

`GET /api/gen-settings` returns both settings blobs (with sensible hardcoded defaults if no row exists yet) and is called only when an inner modal opens — not on general page load. If the saved settings reference a preset (via "Use Preset Filter") that has since been deleted, the modal silently unchecks "Use Preset Filter" and clears the selection rather than erroring or falling back to another preset.

### New API routes

- `GET /api/scan?clean=<bool>` — triggers a Scan (or Scan + Clean) task, returns immediately.
- `POST /api/gen-thumbnails` — triggers a Gen Thumbnails task using the submitted settings (also persisted to `GenSettings`), returns immediately.
- `POST /api/gen-highlights` — same, for Gen Highlights.
- `GET /api/tasks` — returns the active task, the queue, and recent tasks (up to 10).
- `POST /api/tasks/{id}/cancel` — cancels a task by `TaskId`, whether active or queued.
- `GET /api/gen-settings` — returns saved (or default) thumbnail/highlight generation settings.

### Task lifecycle UX notes

No toast notifications for task lifecycle events (queued/started/completed/failed/cancelled) — the polled Tasks tab is considered sufficient on its own.

## Out of Scope

- Updating the Gallery/Tile/Preview rendering to actually use the generated thumbnails/highlights — this spec only covers generating and correctly placing the files.
- The eventual more sophisticated highlight logic (multiple segments pulled from various parts of the video and merged together) — this spec implements only the simplified single-middle-section version.
- A full orphan-preview sweep of `PREVIEW_ROOT` unrelated to a specific Clean deletion — only previews tied to rows actually deleted by Clean are removed.
- Any persistence of task history/state across server restarts.
