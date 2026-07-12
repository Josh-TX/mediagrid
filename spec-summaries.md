# MediaGrid MVP
Date: 2026-07-08

MediaGrid is a mobile-first local media player rewrite: a Go+SQLite backend and a Vue 3 frontend delivering an infinite-scroll shuffle Gallery driven by presets (gallery/filter/player settings), a `GET /api/shuffle` endpoint with simple/whitelist/blacklist filtering and rand/size/az/date sorting, and a settings modal for managing presets. A background startup scan populates the media library via `ffprobe`; the Player itself is out of scope for this spec.

# Clustered Random Shuffle
Date: 2026-07-09

When `sort=random`, the shufflelist is built by k-means clustering filtered media by aspect ratio (K=5), dissolving undersized clusters into their nearest neighbor, then packing "pure" same-cluster rows first (randomly ordered) followed by "impure" leftover rows at the end. Also fixes a related bug where incomplete trailing rows stretch tiles beyond the intended `tilePct` size instead of sizing tiles by target area and leaving blank space.

# Player
Date: 2026-07-10

Implements the full-viewport Player that slides in over the Gallery when a Tile is tapped, letting the user swipe/scroll/key through the shufflelist via three absolutely-positioned media-containers (current/next/prev) with a 150ms swap animation. Includes a HUD with back/fullscreen buttons, a seek bar, title-time row with an info tooltip, and invisible rewind/fast-forward/pause tap zones, all governed by high/low contrast rules and centralized animation/opacity constants.

# URL State
Date: 2026-07-11

Syncs the Gallery/Player with the URL (`i`, `p`, `sort`, `sortDir`, `f` params) so refresh, bookmarking, and native back/forward work without full page reloads, including opening the Player directly (no slide-in, no gallery previews loaded) on a direct load with `i` present. Backend `/api/shuffle` gains a combined `skipr`/`taker`/`takei` row-range mechanism (replacing `minr`/`maxr`) so one request can serve both the Player's target tile and the Gallery's normal page size, plus a new reusable toast system for invalid-index errors.

# Settings Tasks Tab
Date: 2026-07-11

Splits the Settings modal into Presets and Tasks tabs, adding a backend in-memory task queue (one active task at a time, plus Queue and Recent Tasks lists) driven by new `/api/scan`, `/api/gen-thumbnails`, `/api/gen-highlights`, `/api/tasks`, and `/api/gen-settings` routes polled every second while the Tasks tab is open. Gen Thumbnails and Gen Highlights each get an inner settings modal (resolution, quality/segments, filters, preset filter) persisted to a new `GenSettings` table, and generate actual thumbnail/highlight files via `ffmpeg` into a new `PREVIEW_ROOT`, mirroring `MEDIA_ROOT`'s folder structure.

# Gen Highlights Bucketing
Date: 2026-07-11

Replaces the Go rewrite's incomplete Gen Highlights implementation (a leftover single centered-window clip) with a proper evenly-spaced-bucket, multi-segment-extraction-then-concat pipeline mirroring the old TypeScript implementation. Buckets span the full video duration and are sized by the per-video capped segment count (`N` from `CalcHighlightSegments`), with each segment centered on its bucket's midpoint, extracted sequentially via ffmpeg, and stitched together with a stream-copy concat.

# Video Tile Playback Highlights
Date: 2026-07-11

Reworks the `Tile`/`Preview` data model (moving `filesize`/`mdate`/`duration`/`path` onto `Tile`, adding `hasThumbnail`/`hasHighlight` to `Preview`) and adds `GET /thumbnail/{path...}` and `GET /highlight/{path...}` routes so gallery tiles actually load generated thumbnails/highlights instead of always fetching originals. Video tiles follow the existing `autoPlayTile`/`fallbackToOriginal` settings to choose between highlight, original, thumbnail, or a placeholder, and tiles gain new duration-badge and title overlays; the Player is unaffected.

# General Settings
Date: 2026-07-11

Splits the Settings modal's Preset concept into a global "General Settings" (former Gallery + Player sections, including `defaultSort` which becomes non-per-preset) and a narrowed "Preset" (just the former Filter fields, no longer branded as such). Adds `GET /api/settings` (returns `{general, presets}`, called once at startup) and `POST /api/general-settings`, a new `generalSettingsStore.ts` mirroring the existing preset store's temp-storage/revert/save pattern, real dirty-tracking (JSON-diff against a saved baseline) that gates the Revert/Save buttons on both tabs, and a restyled Settings modal with modern underline tabs (General, Presets, Tasks) and a bold icon-style close button.

# Gallery Scroll Sync
Date: 2026-07-12

Makes the Gallery's scroll position track the Player as it swaps between media, instead of staying frozen, so the Gallery is already correctly positioned when the Player closes. Handles both tap-to-open (anchor on the tapped tile's row and current scrollTop, then delta by row-height offsets on each swap) and direct-load/refresh (anchor computed so the selected tile's row sits 100px below the viewport top), entirely within `Gallery.vue` via two watchers on `playerStore` state, with instant (non-animated) scrollTop snaps and lower-bound-only clamping.
