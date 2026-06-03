# Media Gallery App
Date: 2026-05-15

Initial spec for the project: a privately hosted Docker-based web app displaying a gallery of images from a volume-mounted `/media` directory. Establishes the monorepo structure (backend, frontend, types), the `ImageEntry` schema, a seeded shuffle endpoint (`GET /api/images?r=<seed>`), 2-column CSS Grid layout with landscape images spanning both columns, and the dev/test/Docker workflow.

# DB-Backed Media
Date: 2026-05-15

Replaces the per-request filesystem walk with a SQLite database (`/data/mediagrid.db`) as the source of truth for Media. Introduces the `media` table, a background Scan task (auto-runs on startup and via `POST /api/tasks/scan`), and renames the API endpoint to `GET /api/media`. Also renames `ImageEntry` to `MediaEntry` and adds video support (ffprobe for metadata).

# Gallery Toolbar
Date: 2026-05-16

Adds a sticky, transparent Toolbar to the Gallery with a debounced search input (SimpleFilter) and a settings icon. The search input drives a new `q` query param on the backend for case-insensitive path filtering. The settings icon opens a Radix UI Dialog with Presets and Tasks tabs, both stubbed with placeholder content.

# Gallery Infinite Scroll
Date: 2026-05-17

Replaces the flat 20-item `GET /api/media` endpoint with a block-based `GET /api/blocks` API and an IntersectionObserver-driven infinite scroll Gallery. Introduces `PreviewInfo`, `TileInfo`, `BlockInfo`, and `BlockResponse` types. Blocks are 2×2 Cell grids; the frontend fetches the first three on mount then loads one more as the user scrolls, with skeleton loading, error toast, empty, and end-of-gallery states.

# Preset Management
Date: 2026-05-17

Implements full preset management: a SQL-backed `preset` table, `GET /api/presets` and `PUT /api/presets` endpoints, and a frontend UI for creating, editing, and switching presets. Presets control gallery layout (columns, rows), cluster count, media type and duration/aspect-ratio filters, CSV path filters, and cropping limits. The active preset and SimpleFilter are stored in the URL; the Settings modal Presets tab provides a full CRUD UI with local-state edits committed via Save.

# Preview Generation
Date: 2026-05-17

Implements Gen-Thumbnails and Gen-Highlights as new task types, replacing the Previews tab stub in the settings modal. The Previews tab gains a Radix ToggleGroup switcher between two forms — one per task type — each with resolution, compression/ffmpeg, override, and filter settings. Settings are persisted server-side in a new `last_preview_settings` SQLite table and loaded when the tab opens. Gen-Thumbnails converts images to WebP and extracts video midpoint frames; Gen-Highlights generates short highlight clips via ffmpeg segment extraction and concat. Multiple instances of either task type can queue simultaneously.

# Player
Date: 2026-05-17

Adds a full-viewport Player view that slides in from the right when a Gallery Tile is tapped. The Player displays the current Media item sized via object-fit contain logic, with the previous and next Shuffle items stacked above and below. Users swipe up/down to navigate; committing requires a fast flick or dragging past a configurable threshold of the current item's height. The shuffle wraps around at boundaries with a debug toast. Videos autoplay with audio and loop. A new `GET /api/media-info` endpoint returns flat MediaInfo by shuffle index, keeping the Player fully independent of the Gallery's block-based fetch.

# Cluster Layout Shuffle
Date: 2026-05-20

Replaces the flat grid shuffle with a cluster-aware layout algorithm. Removes `galleryColumns` and `galleryRows` from the Preset, replacing them with `targetTilePercent` and `maxTilePercent`. Caps `clusterCount` at 1–3. Blocks become single horizontal rows of tiles with an `isFull` flag; tiles get a `width` field (0–1) replacing x/y/rowspan/colspan. The blocks API requires `w` and `h` viewport params on the initial call. The shuffle cache now stores `{ blocks, media }` instead of a flat array. The algorithm clusters filtered media by aspect ratio via k-means, computes a Cluster Tiles Per Block (CTPB) value per cluster using the tile-area formula `W / (CTPB² × a × H)`, merges clusters whose CTPB exceeds the cluster count, fills pure blocks from each cluster, then fills remainder blocks using a sum-closer-to-1 packing rule.

# Server-Side Shuffle Cache
Date: 2026-05-18

Replaces the seed-based stateless shuffle with a server-side in-memory cache. The backend generates the shuffle once, stores it keyed by a random 6-digit shuffleId, and returns that ID to the client. Subsequent block and media-info requests reference the cached shuffle via an optional `s` query param. The cache uses sliding 1-hour expiry via setInterval sweep. The frontend stores the shuffleId in React state and the URL `?s=` param, gates further block fetches until the first shuffleId arrives, and gracefully resets on 404 (expired shuffle) from either Gallery or Player.

# Gallery Previews and Tile Crop
Date: 2026-05-20

Adds proper preview resolution to the gallery so tiles show highlights (looping video), thumbnails (webp image), the original image, or a placeholder depending on what has been generated. Introduces a MediaRecord/PreviewInfo type split so previewType is resolved per-request rather than at shuffle creation. Adds /thumbnails/* and /highlights/* backend routes, updates gen-highlights to write to /data/highlights/, computes a fixed block height on the frontend via a single ResizeObserver, and implements the tileCropMaxX/Y preset settings as a scale-then-cap cropping algorithm per tile.

# Player Improvements
Date: 2026-05-21

Adds three new Preset fields to the Player: `forwardPreloadCount`, `backwardPreloadCount` (dropdowns 1–3, default 1), and `oneFileAtATime` (bool, default false). Renames `videoCropMaxX/Y` to `playerCropMaxX/Y` and wires them up in the Player via an extended `computeDims` that expands media beyond the viewport (scale-then-cap, same logic as tile crop). The "Layout" settings section is renamed "Gallery"; a new "Playback" section holds all player-specific controls. When `oneFileAtATime` is on, preload counts are forced to 1, the dropdowns hide and show a static "1", and slot spacing changes from `dims.height` to `(dims.height + vpH) / 2` — keeping the existing stack/translateY mechanism but placing adjacent items exactly at the viewport edge. DB is wiped and recreated.

# Player Controls
Date: 2026-05-22

Adds interactive playback controls to the Player: tap zones (left 25% rewind, middle 50% play/pause, right 25% fast-forward) using native `onClick` tap detection, animated per-zone overlays with accumulation (600ms fade, 500ms accumulate window), a video-only seek bar (1px line at 48px from bottom, 32px hit area, 32px side-padding jumps to 0/end, scrubs on drag, clamps at boundaries), and a fullscreen toggle button (top-right, ⛶ / × icon, native Fullscreen API). Also adjusts the back button to 8px offsets and lower opacity, and adds two new Preset fields: `rewindSeconds` and `fastForwardSeconds` (both default 10, number inputs in Playback settings). DB is wiped and recreated.

# Gallery Sort
Date: 2026-05-24

Adds a sort-by control to the Gallery Toolbar. Four options: random (existing cluster shuffle), size (filesize), A-Z (full path), and date (mdate). The Toolbar gains a sort-direction icon to the left of the sort select — a dice for random (re-shuffles on click) or ↑/↓ arrow for non-random (toggles asc/desc). Sort type and direction are stored in URL params only (ephemeral, not in Preset). The backend accepts `sort` and `dir` params on the initial block request and builds a sorted layout cached under a shuffleId; subsequent requests use the shuffleId unchanged. Non-random layouts use a greedy block-packing algorithm: tile widths are derived from the targetTilePercent area formula, then tiles are packed with a "closer to 100%" heuristic, with a priority override to prevent any tile from exceeding maxTilePercent after normalization.

# Title Display
Date: 2026-05-24

Adds media title (filename without extension) display to both the Player and Gallery. In the Player, a title + time-remaining row sits permanently just above the repositioned seek bar (moved from 48px to 4px from bottom, side padding 12px). A contrast/subtle opacity system replaces the simple seekBarVisible boolean: contrast mode (15% black overlay, 100% controls) triggers on media change, seek, unpause, or tap; subtle mode (0% overlay, 70% controls) kicks in after a 1500ms hold + 1000ms fade. Pausing holds contrast mode indefinitely; tapping anywhere toggles. On media transition, title/seekbar/time fade out 150ms then back in 150ms, synced to the 300ms swipe animation. In the Gallery, a new `showTileTitle` preset field (default true) shows the title bottom-left on each tile with a ~35px gradient overlay and a font size dynamically bucketed from 10–16px in 2px steps based on tile pixel width.

# Browser History Navigation
Date: 2026-05-28

Adds proper browser history support so the URL fully represents app state and the native back/forward buttons work for navigation. Introduces an `?i=N` query param for the Player's current index (only present when Player is open). Replaces the single `replaceState` effect with per-handler `pushState`/`replaceState` calls: pushState on open player, close player, reshuffle, sort/dir/preset/search change; replaceState on player index navigation, server assigning a new shuffleId, shuffle-expired close, and initial load. Player writes its own replaceState directly on index change. A `popstate` listener in Gallery syncs all React state (including player open/index) from the URL when the user navigates back or forward. On page refresh with `?s=N&i=M`, the Player initializes open at index M; if the shuffleId is expired, the existing 404 handler recovers gracefully.

# Temporary Presets
Date: 2026-05-30

Adds a way to save presets temporarily (in-memory on the server, cleared on restart) alongside the existing permanent (SQLite-backed) save. The single Save button in the SettingsModal is replaced by three equal-weight buttons: "Save Temporarily", "Save Permanently", and "Cancel". A new `PUT /api/presets/temp` endpoint stores the full preset array in a server-side `Map<sessionId, Preset[]>` and returns a sessionId. The browser persists the sessionId in sessionStorage and appends it as `&sessionId=<id>` to all preset-related API calls. `GET /api/presets` now returns `{ presets, isTemp }`, switching to the temp store when the sessionId is known. `GET /api/blocks` also resolves presets from the temp store when a sessionId is present. Saving permanently clears the sessionId from sessionStorage. A "Using temporary presets" label appears at the top of the Presets tab when isTemp is true. The "Duplicate" button is replaced by a "New Preset" button that always copies the default preset.

# Video Tile Type Preset Setting
Date: 2026-06-02

Adds two new Preset fields — `videoTileType` and `videoFallbackToOriginal` — controlling how video tiles display in the Gallery. `videoTileType` is a three-value enum: `"thumbnail-only"` (never show highlights), `"touch-to-highlight"` (thumbnail by default, hover/touch plays the highlight with desktop hover-end snap-back and mobile one-at-a-time behavior, plus a white triangle indicator in the top-right corner), and `"highlight-if-available"` (current autoplay behavior, unchanged, and the default). `videoFallbackToOriginal` (boolean, default false) causes the original video file to be used in place of a missing highlight; the checkbox is hidden when `videoTileType` is `"thumbnail-only"`. Requires extending `PreviewInfo` with a `hasHighlight` boolean so the frontend can independently manage thumbnail-vs-highlight rendering and the triangle indicator.
