# Preview Generation

## Description

I want to implement the Gen-Thumbnails and Gen-Highlights tasks and wire them up through a redesigned Previews tab in the settings modal. The Previews tab currently shows a stub placeholder — this replaces it with two fully functional forms.

### Previews Tab UI

The Previews tab uses a Radix UI `ToggleGroup` (type="single") as a segmented switcher between "Thumbnails" and "Highlights" forms. Only one form is visible at a time. This avoids scrolling issues on small screens. The switcher sits at the top of the tab panel.

When the Previews tab is first opened, fetch `GET /api/preview-settings` and populate both forms with the returned values. If no record exists yet, show defaults. Both forms share the same filter section structure but are otherwise independent.

Each form has a "Generate" button at the bottom. Clicking it POSTs to the relevant task endpoint (see below), which both enqueues the task and saves the form's current values to `LastPreviewSettings` server-side. On success, invalidate the tasks query so the Tasks tab reflects the new queue entry.

### Filter Section (shared pattern for both forms)

- A standalone `SimpleFilter` text input (space-delimited, all terms AND-matched against the media file path). Independent of the Toolbar's search — not synced.
- A checkbox labeled "Use preset filter". When unchecked, the preset dropdown is hidden. When checked, a dropdown appears showing all available presets, defaulting to `"default"`.

### Gen-Thumbnails Form

- **WebP compression quality:** dropdown with values 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80. Each option is labeled `"<value> - <description>"` where descriptions follow this grouping: 80 = "minimal compression", 75–70 = "low compression", 65–55 = "medium compression", 50–40 = "high compression", 35–20 = "extreme compression". Default: 50.
- **Resolution:** dropdown with options 200×200, 300×300, 400×400, 500×500, 600×600, 700×700, 800×800. The underlying value is width × height (pixel area). Default: 500×500.
- **Override:** checkbox. When unchecked, media items with an existing thumbnail are skipped. Default: unchecked.
- Filter section as described above.

### Gen-Highlights Form

- **Resolution:** same dropdown as Gen-Thumbnails. Default: 500×500.
- **Override:** checkbox. Same behavior as Gen-Thumbnails. Default: unchecked.
- Filter section as described above.
- **Highlight duration:** unconstrained number input (seconds). Default: 6.
- **Segment count:** unconstrained number input. Default: 10.
- **Segment duration:** read-only text field showing the inferred value (`highlight duration / segment count` in seconds, e.g. "0.6s per segment").
- **ffmpeg arg:** text input applied to each segment extraction command. Default: `-c:v libx264 -crf 25 -preset fast`.

### LastPreviewSettings (server-side persistence)

Add a new SQLite table `last_preview_settings` with a single row (id = 1). It stores all fields for both forms: thumbnail compression, thumbnail resolution, thumbnail override, highlight resolution, highlight override, highlight duration, highlight segment count, highlight ffmpeg arg, and the filter state for each task (simple filter text, whether preset filter is enabled, preset name). 

Add `GET /api/preview-settings` — returns the single row as JSON, or defaults if no row exists.

The POST endpoints for both tasks (see below) accept the full form state in the request body and upsert this record as part of handling the request.

### Backend: Gen-Thumbnails Task

Add `POST /api/tasks/gen-thumbnails`. Request body contains: compression (number), resolution (number = pixel area), override (boolean), simpleFilter (string), usePresetFilter (boolean), presetName (string | null).

Unlike Scan and Clean, multiple Gen-Thumbnails tasks may be queued simultaneously — do not check for duplicates.

**Implementation:**
1. Fetch all media from the DB. Apply the SimpleFilter (all terms must appear in path) and, if enabled, the PresetFilter. Do NOT implicitly restrict to images only — the user's filter controls media type.
2. If override is false, skip media items where `$DATA_DIR/thumbnails/<relative-path>.webp` already exists on disk.
3. For each remaining media item:
   - Compute target dimensions: `targetW = round(sqrt(pixelArea * (width / height)))`, then snap to the nearest even number. Use ffmpeg scale filter `scale=<targetW>:-2`.
   - For images: run ffmpeg to convert to WebP at the given quality: `ffmpeg -i <input> -vf scale=<w>:-2 -quality <q> <output.webp>`.
   - For videos: seek to the video's midpoint (`duration / 2` in seconds), extract one frame, convert to WebP: `ffmpeg -ss <midpoint> -i <input> -vframes 1 -vf scale=<w>:-2 -quality <q> <output.webp>`.
   - Output path: `$DATA_DIR/thumbnails/<relative-path>.webp`. Create intermediate directories as needed.
   - If ffmpeg fails for a single item, log the error and continue.
4. Update status string to `"<processed> / <total>"` after each item.
5. On completion, set the outcome message to `"<count> thumbnails generated, avg <size>"` where size is the average filesize of the generated files in a human-readable form (e.g. KB or MB).

### Backend: Gen-Highlights Task

Add `POST /api/tasks/gen-highlights`. Request body contains: resolution (number), override (boolean), simpleFilter (string), usePresetFilter (boolean), presetName (string | null), highlightDuration (number, seconds), segmentCount (number), ffmpegArg (string).

Multiple Gen-Highlights tasks may be queued simultaneously.

**Implementation:**
1. Fetch all media from the DB. Apply filters as above, then additionally restrict to videos only (media_type = 1).
2. If override is false, skip items where `$DATA_DIR/videos/<relative-path>.mp4` already exists.
3. For each remaining video:
   - If the video's duration (ms) is less than `highlightDuration * 1000`, skip it entirely.
   - Compute `segmentDuration = highlightDuration / segmentCount` seconds.
   - Compute target dimensions using the same pixel-area formula as Gen-Thumbnails.
   - For each segment i (0-indexed):
     - Bucket start = `(i / segmentCount) * videoDuration` seconds.
     - Segment start = `bucketStart + (videoDuration / segmentCount) / 2` seconds (midpoint of bucket).
     - Extract clip: `ffmpeg -ss <start> -i <input> -t <segmentDuration> -vf scale=<w>:-2 <ffmpegArg> <tempFile_i.mp4>`.
     - Store temp files in the OS temp directory.
   - Concatenate segments in order using ffmpeg concat demuxer with `-c copy`.
   - Output path: `$DATA_DIR/videos/<relative-path>.mp4`. Create intermediate directories as needed.
   - Clean up all temp segment files after concatenation (whether it succeeds or fails).
   - If ffmpeg fails for a single video (any step), log the error, clean up its temp files, and continue.
4. Update status string to `"<processed> / <total>"` after each video.
5. On completion, set the outcome message to `"<count> highlights generated, avg <size>"`.

### Shared Types

Extend the `type` field in `ActiveTask`, `QueuedTask`, and `RecentTask` to include `"gen-thumbnails"` and `"gen-highlights"`. Add a `PreviewSettings` schema to the types package matching the `last_preview_settings` structure.

### Environment Variables

`MEDIA_DIR` and `DATA_DIR` are already available as environment variables. Thumbnails output to `$DATA_DIR/thumbnails/`, highlight videos to `$DATA_DIR/videos/`.

## Out of Scope

- The Clean task is not extended to clean up orphaned thumbnails or highlights.
- The Tasks tab UI is not changed — it shows task type only, no settings summary for the new task types.
- No Gallery integration — displaying Previews in Tiles is a separate feature.
