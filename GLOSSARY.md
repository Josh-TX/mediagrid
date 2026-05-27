# Glossary

(Some of this information is for features not yet implemented)

## Block

A full-screen-width container that forms one vertical unit of the Gallery. A Block contains either 1 or 2 Rows of Cells and has variable height. Blocks are stacked vertically to form the Gallery. A Tile cannot span across Block boundaries. See also: Row, Cell, Tile.

## Cell

The smallest unit of the Gallery grid: one Column wide and one Row tall within a Block. Tiles are allocated from one or more Cells in a rectangular arrangement. See also: Block, Row, Column, Tile.

## Clean

A background Task that verifies the integrity of all Media records in the database. For each record, it checks that the file still exists on disk and that its filesize matches the stored value. If the filesize has changed, the Media's info (resolution, duration) is re-examined and updated. If the file no longer exists, the DB record and all associated Previews (Thumbnails and Highlights) are deleted. See also: Scan, Task.

## Cluster

A runtime grouping of Media items with similar aspect ratios, computed from the filtered Media pool using k-means clustering. The number of Clusters is a Preset setting (default: 3). Clusters are used during layout computation to drive Block layout decisions — for example, portrait Media may form one Cluster and landscape Media another, influencing how Tiles are arranged within Blocks. Clusters are not persisted. See also: Preset, Block, Shuffle.

## Column

One of the equal-width vertical divisions of the Gallery grid. All columns share the same width. A Tile may span multiple columns but never multiple rows. The number of columns is a Preset setting.

## Default Preset

The built-in Preset whose name is literally `"default"` (case-insensitive). Always present — when loading presets, it is auto-generated if it does not exist. Users may modify its values, which changes the app's default behavior, but it cannot be deleted. All PresetFilter fields default to null (no filtering) in a freshly generated Default Preset.

## Filter

The combined gate that determines which Media items are included in the Shuffle. A Media item must pass both the SimpleFilter and the PresetFilter simultaneously. The two filters are independent — SimpleFilter is ephemeral and session-scoped; PresetFilter is persisted in the active Preset. See also: SimpleFilter, PresetFilter.

## Fullscreen

The state in which the browser's native fullscreen mode is active — triggered by `requestFullscreen()` in JS or F11 on desktop. Distinct from the Player's full-viewport layout: the Player always fills the viewport, but Fullscreen additionally invokes the browser fullscreen API and typically hides browser chrome.

## Gallery

The home page of the app. Technically a vertical list of Blocks, each containing a grid of Cells and Tiles with Previews of scanned Media. Users experience it as a grid. Tapping a Tile opens the Player. _Avoid_: "dashboard" — not a term in this project.

## Gen-Highlights

A background Task that generates Highlight previews for video Media only. Videos shorter than the configured highlight duration are skipped. Per-item ffmpeg failures are skipped and logged; the task continues with remaining items. Multiple Gen-Highlights Tasks can be queued simultaneously (unlike Scan and Clean, which are limited to one at a time).

**Segment logic:** The source video is divided into N equal-duration buckets (N = segment count). A short clip is extracted from the midpoint of each bucket using a separate ffmpeg command. Clips are concatenated in chronological order using `-c copy` (stream copy, no re-encode). Temporary segment files are stored in an OS temp directory and deleted after concatenation.

**Settings:**
- **Highlight duration** (default 6s) + **segment count** (default 10); segment duration is inferred as duration ÷ count and shown as a read-only field
- **Video resolution:** pixel area target; dropdown from 200×200 to 800×800 in steps of 100 (default 500×500); underlying value is W×H; aspect ratio preserved, dimensions forced even via ffmpeg `scale=<w>:-2`
- **ffmpeg arg:** text input (default `-c:v libx264 -crf 25 -preset fast`), applied to each segment extraction; concatenation always uses `-c copy`
- **Override:** checkbox; when unchecked, Media with an existing Highlight is skipped
- **Filter:** standalone SimpleFilter text input + optional preset (checkbox reveals preset dropdown, defaults to "default"); independent of the Toolbar's SimpleFilter

Output: `$DATA_DIR/videos/<relative-path>.mp4` (source path with `.mp4` appended). Settings persisted server-side in LastPreviewSettings. See also: Task, Highlight, Filter, Gen-Thumbnails, LastPreviewSettings.

## Gen-Thumbnails

A background Task that generates Thumbnail previews for Media. Operates on both image and video Media by default (the filter can narrow this). For images, the source is converted to WebP. For videos, a still frame is extracted from the video's midpoint and saved as WebP. Per-item ffmpeg failures are skipped and logged; the task continues. Multiple Gen-Thumbnails Tasks can be queued simultaneously.

**Settings:**
- **WebP compression quality:** dropdown from 20 to 80 in steps of 5 (default 50), labeled e.g. "80 - minimal compression", "20 - extreme compression"
- **Resolution:** pixel area target; dropdown from 200×200 to 800×800 in steps of 100 (default 500×500); underlying value is W×H; aspect ratio preserved, dimensions forced even via ffmpeg `scale=<w>:-2`
- **Override:** checkbox; when unchecked, Media with an existing Thumbnail is skipped
- **Filter:** standalone SimpleFilter text input + optional preset (checkbox reveals preset dropdown, defaults to "default"); independent of the Toolbar's SimpleFilter

Output: `$DATA_DIR/thumbnails/<relative-path>.webp` (source path with `.webp` appended). Settings persisted server-side in LastPreviewSettings. See also: Task, Thumbnail, Filter, Gen-Highlights, LastPreviewSettings.

## Highlight

A short video (typically 3–10 seconds, configurable via Highlight-gen settings) that summarizes a source video Media item. Generated by the Gen-Highlights Task from fixed-duration intervals of the source video. Displayed as a Preview in a Tile on the Gallery. A subtype of Preview — use "highlight" specifically for video-based previews.


## Media

The original image or video file from the `/media` directory. Stored in the database after Scan with fields: path, width, height, duration (null for images), filesize, mdate, media_type. Media is immediately eligible for the Shuffle once scanned, even before any Preview is generated. _Avoid_: using "media" to mean any derived or display form (Preview, Thumbnail, Highlight).

## Player

The full-viewport view of a single Media item — works for both images and videos. Opened by tapping a Tile in the Gallery. Navigates through the Shuffle order: swipe up for the next item, swipe down for the previous. Distinct from Fullscreen: the Player always fills the viewport but does not necessarily invoke the browser's fullscreen API.

## Preset

A named collection of settings that controls filtering and display behavior. Names are unique case-insensitively; the name `"default"` is reserved for the Default Preset. A Preset contains: a PresetFilter (ExcludeNotContainsCsv, ExcludeContainsCsv, duration, aspect ratio, media type filters), cropping rules for the Player and Gallery, and display settings (e.g. column count). See also: Default Preset, PresetFilter.

## PresetFilter

The set of path-based and metadata filters persisted within a Preset. Fields:

- **ExcludeNotContainsCsv** (whitelist): comma-separated terms; Media is excluded if its path contains none of them (OR logic — path must match at least one term to pass).
- **ExcludeContainsCsv** (blacklist): comma-separated terms; Media is excluded if its path contains any of them.
- Duration, aspect ratio, and media type filters.

All fields default to null in a freshly generated Default Preset (no filtering). Applied together with the SimpleFilter to determine the Shuffle.

## Preview

A displayable representation of a Media item shown in a Tile on the Gallery. Supertype covering Thumbnail (still image preview) and Highlight (short video preview). A Tile may be empty if no Preview has been generated yet. _Avoid_: using "preview" and "thumbnail" interchangeably — thumbnail is specifically a still image.

## Row

A horizontal band of Cells within a Block. A Block contains either 1 or 2 Rows. When a Block has 2 Rows, Tiles may span both Rows or occupy only one, with a different Tile underneath in the same columns. Row height is variable, determined by screen width and the aspect ratios of the Tiles it contains. See also: Block, Cell.

## Scan

A background Task that discovers Media files within the `/media` directory and inserts their basic info into the database: path, width, height, duration (null for images), filesize, mdate, media_type. Uses INSERT OR IGNORE — already-known paths are skipped (updating changed records is Clean's responsibility). Auto-runs on server startup; also triggerable via `POST /api/tasks/scan`. Media is immediately eligible for the Shuffle once scanned. See also: Clean, Task.

## Seed (r)

An integer query parameter passed to `GET /api/media?r=<integer>` that determines the deterministic shuffle order of the returned Media. The backend uses mulberry32 (a seeded PRNG) to produce a Fisher-Yates shuffle reproducible from the same seed. The frontend generates a new random integer on each page mount, so every page refresh yields a different ordering. The Shuffle regenerates when relevant settings change; the same seed does not guarantee the same results if the filtered Media pool has changed. Omitting or passing an invalid `r` returns 400.

## Shuffle

As a noun: the ordered list of Media items produced by applying the current Seed and Filter. As a verb: the process of generating that list. The Shuffle regenerates when the active Preset, PresetFilter, or SimpleFilter changes — the Seed may stay the same but results are not guaranteed to be identical if the filtered pool changed. The Shuffle is the sequence navigated in the Player and displayed in the Gallery.

## SimpleFilter

An ephemeral (non-persisted) text filter accessible directly from the Gallery. Search terms are whitespace-delimited; all terms must appear somewhere in the Media's file path (AND logic, order-insensitive). Not saved to any Preset — cleared on session end. Applied together with the PresetFilter to determine the Shuffle.

## Task

A background operation that runs server-side. Subtypes: Scan, Clean, Gen-Thumbnails, Gen-Highlights. Only one Task can be active (running) at a time across all types. Additional Tasks are held in the Task Queue and auto-start when the active Task finishes.

## Task Queue

An in-memory FIFO queue of Tasks waiting to run. A Task is enqueued when submitted while another Task is active. Queued Tasks auto-start in order as soon as the active Task finishes. Queued Tasks can be cancelled before they start but cannot be reordered. The queue does not persist across server restarts.

## Thumbnail

A downscaled still image derived from a source image Media. Generated by the Gen-Thumbnails Task. A subtype of Preview — use "thumbnail" only for still image previews. _Avoid_: using "thumbnail" loosely to mean any kind of preview.

## Toolbar

A sticky, transparent strip at the top of the Gallery containing a search input (the UI label for the SimpleFilter) and a settings icon. Minimalistic by design — no solid background, white text. _Avoid_: "header", "nav".


## Tile

A rectangular allocation of one or more Cells in the Gallery grid that holds a Preview. A Tile may span multiple Cells horizontally (multiple Columns) and/or vertically (multiple Rows within a Block), but the spanned Cells must form a rectangle — L-shapes are not allowed. A Tile cannot span across Block boundaries. Tile dimensions are determined by the Cells it occupies; the Preview letterboxes to fit if aspect ratios differ. A tile may be empty if its Preview has not been generated or is still loading. See also: Block, Cell, Preview.
