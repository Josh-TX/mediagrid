# MediaGrid MVP
Date: 2026-07-08

MediaGrid is a mobile-first local media player rewrite: a Go+SQLite backend and a Vue 3 frontend delivering an infinite-scroll shuffle Gallery driven by presets (gallery/filter/player settings), a `GET /api/shuffle` endpoint with simple/whitelist/blacklist filtering and rand/size/az/date sorting, and a settings modal for managing presets. A background startup scan populates the media library via `ffprobe`; the Player itself is out of scope for this spec.

# Clustered Random Shuffle
Date: 2026-07-09

When `sort=random`, the shufflelist is built by k-means clustering filtered media by aspect ratio (K=5), dissolving undersized clusters into their nearest neighbor, then packing "pure" same-cluster rows first (randomly ordered) followed by "impure" leftover rows at the end. Also fixes a related bug where incomplete trailing rows stretch tiles beyond the intended `tilePct` size instead of sizing tiles by target area and leaving blank space.
