## Style

Prefer Effect's built-in APIs (FileSystem, HttpClient, Schema, etc.) over raw Node/Bun APIs. Only drop down to plain async/Promise when no Effect equivalent exists.

## Glossary

This is the brief glossary. More details on each term is available in GLOSSARY.md.

(Some of this information is for features not yet implemented)

**Block**: top-level layout unit of the Gallery; holds 1 or 2 Rows of Cells; Tiles are confined within it.
**Cell**: smallest grid unit; one Column wide by one Row tall; Tiles occupy one or more Cells.
**Clean**: Task that verifies DB media records — checks existence/filesize, re-examines info if changed, deletes record and previews if file is gone.
**Cluster**: runtime k-means grouping of filtered Media by aspect ratio; drives Block layout decisions.
**Column**: vertical division of the Gallery grid; all Columns share the same width; count configured in Preset.
**Default Preset**: built-in Preset named `"default"`; auto-generated if missing; user-editable but not deletable.
**Filter**: combined gate (SimpleFilter AND PresetFilter) that determines which Media items enter the Shuffle.
**Fullscreen**: browser native fullscreen via `requestFullscreen()` or F11; distinct from the Player's full-viewport layout.
**Gallery**: home page; a vertical list of Blocks forming a grid of Previews; tapping a Tile opens the Player.
**Highlight**: short video (3–10s) summarizing a source video; subtype of Preview.
**Gen-Highlights**: Task that generates Highlight previews for video Media via ffmpeg segment extraction.
**Media**: original image or video from `/media`; not a preview or thumbnail.
**Player**: full-viewport view of a single Media item; navigates Shuffle order via swipe up/down.
**Preset**: named collection of settings (PresetFilter, cropping rules, column count, etc.); names unique case-insensitively.
**PresetFilter**: filters persisted in a Preset; ExcludeNotContainsCsv (whitelist), ExcludeContainsCsv (blacklist), plus duration/aspect ratio/media type filters.
**Preview**: displayable representation of a Media item shown in a Tile; supertype of Thumbnail and Highlight.
**Row**: horizontal band of Cells within a Block; a Block has 1 or 2 Rows.
**Scan**: Task that discovers new Media in `/media` and inserts path, width, height, duration, filesize, mdate, media_type; INSERT OR IGNORE; auto-runs on startup + POST /api/tasks/scan.
**Seed (r)**: integer query param on `GET /api/media` driving deterministic shuffle via mulberry32; generated fresh each page load.
**Shuffle**: (noun) ordered list of Media from Seed + Filter; (verb) generating that list; regenerates when settings change.
**SimpleFilter**: ephemeral space-delimited text filter; all terms must appear in Media file path (AND logic); not persisted.
**Gen-Thumbnails**: Task that generates Thumbnail previews for image and video Media via ffmpeg.
**Task**: background operation (Scan, Clean, Gen-Thumbnails, Gen-Highlights); only one active at a time;
**Toolbar**: sticky transparent strip at top of Gallery; search input (SimpleFilter) + settings icon.
**Task Queue**: in-memory FIFO queue of pending Tasks; auto-starts on completion; cancellable but not reorderable; not persisted.
**Thumbnail**: downscaled still image from source Media; subtype of Preview.
**Tile**: rectangular allocation of Cells holding a Preview; may span multiple Columns and/or Rows within a Block; cannot cross Block boundaries; preview letterboxes if aspect ratios differ.
