# MediaGrid MVP
Date: 2026-07-08

MediaGrid is a mobile-first local media player rewrite: a Go+SQLite backend and a Vue 3 frontend delivering an infinite-scroll shuffle Gallery driven by presets (gallery/filter/player settings), a `GET /api/shuffle` endpoint with simple/whitelist/blacklist filtering and rand/size/az/date sorting, and a settings modal for managing presets. A background startup scan populates the media library via `ffprobe`; the Player itself is out of scope for this spec.
