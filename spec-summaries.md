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
