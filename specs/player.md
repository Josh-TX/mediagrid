# Player

## Description

I want to implement the Player feature: a full-viewport view that slides in over the Gallery when a Tile is tapped, letting the user swipe/scroll/key through the shufflelist one Media item at a time, with a HUD for playback controls.

### Opening / closing

Initially the Player isn't rendered at all. When a Tile is tapped, the Player slides in from the right edge of the screen over 150ms, covering the entire viewport (including the Toolbar, which sits underneath it). When the back button (top-left, left-arrow SVG) is pressed, the Player slides back out to the right over 150ms and then fully deactivates (unmounts) for performance. Every time the Player is opened it starts fresh at the tapped Tile, playing from position 0 — it never resumes a previous session's state. Opening the Player does not push browser history state; the hardware/browser back button is not wired to close it. On desktop, pressing `Escape` also closes the Player (in addition to the back button).

While the Player is open, the Gallery underneath stays exactly as-is (same scroll position, same layout), except that each `Tile.vue` stops rendering its inner `<img>`/`<video>` element (the outer sized `div` stays, so DOM structure/scroll height is unaffected) — this is purely for performance.

### Data / architecture

Add a `playerStore.ts` following the existing hand-rolled `reactive()` store convention (like `galleryStore`/`uiStore`, not Pinia). It holds whether the Player is open, the current media index, and a flat ordered media list built by flattening `galleryStore.state.rows` in `tilei` order. `Tile.vue`'s `onClick` (currently `alert('not implemented')`) should call into this store to open the Player at that tile's index.

Since the Gallery paginates rows server-side (`minr`/`maxr`, 20 rows/page) and `tilei` is a global index into the whole shufflelist, the Player must proactively call `galleryStore.loadMore()` well before it runs out of loaded tiles — e.g. once the current index is within roughly the last 2 loaded rows' worth of tiles — rather than waiting until a swipe fails because there's nothing loaded to swap to. Prev never needs to fetch more, since the Gallery always starts loading from row 0.

All the tunable numbers described below (durations, thresholds, opacities, etc.) should live as named constants in a dedicated constants file so they're easy to tweak later, rather than being inlined as magic numbers.

### Media containers

The Player consists of exactly 3 media-containers — current, next, prev — plus a HUD layered above all of them. Each media-container is absolutely positioned and exactly viewport-sized. We never mutate the media inside a container; we only reposition, destroy, and recreate whole media-container components.

Each container shows the actual full-resolution Media (`tile.path` via `mediaUrl()`), not a Thumbnail/Highlight preview. It uses the same crop-then-letterbox hybrid logic as `Tile.vue`'s `mediaStyle`, but driven by the preset's `playerCropX`/`playerCropY` instead of `tileCropX`/`tileCropY`.

Videos autoplay unmuted with sound. On initial Player open, only the current media-container is created/loaded at first, with priority given to getting it playing as fast as possible (`preload="auto"`); only once the current media has fired a loaded event do we create the next and prev containers, both also with `preload="auto"`. Prev/next containers are not actively playing — they're just ready to be swapped in.

`onVidEnd` (`loop` / `stop` / `next`) behavior: `loop` restarts the video at 0 and keeps playing; `stop` pauses on the last frame; `next` automatically triggers the same swap animation/logic as a manual swipe-to-next (cascading further if the new current is also a short/ended video).

If a `stop`-ended video is resumed via the pause/play tap zone, it should seek back to 0 before playing (since a `.play()` call at `currentTime === duration` would otherwise do nothing perceptible).

### Swap mechanics

A swap happens on mobile swipe, desktop scroll (wheel/trackpad), or desktop Up/Down keys. Swipe up / scroll down / Down key → next. Swipe down / scroll up / Up key → prev.

**Touch swipe**: the container follows the finger 1:1 vertically during the drag, with rubber-banding/resistance. On release: if the drag passed a commit threshold (20% of viewport height dragged, or a fast-enough flick), the swap always completes via a fixed 150ms animation from wherever it was released to fully-swapped, with mid-swap firing exactly 75ms after release regardless of how far the finger had already dragged. If the drag was below threshold, it snaps back to current over 150ms.

**Desktop scroll**: treated as a simple discrete trigger (not drag-follow, to keep desktop controls minimal) — any wheel event past a small delta threshold immediately fires one full 150ms swap, with a debounce/cooldown afterward so one scroll gesture doesn't cascade through multiple swaps.

**Keyboard**: Up/Down press is also a discrete trigger of the full 150ms swap.

New swap input (of any kind) is ignored/debounced while a swap animation is already in-flight — no interrupting or queuing.

When swapping to next: the current container animates upward and off-screen, the next container animates from below the viewport up until it fills it, the prev container is destroyed, and a new container is created for whatever comes after the new current item. Swapping to prev is the mirror image. Mid-swap (75ms in) is when the underlying media actually changes/swaps logically — if the new current is a video, it should start playing exactly at mid-swap, not wait for end-swap.

Edge cases: if the user tries to swap toward an end that doesn't exist yet (no prev before the first item, or next not loaded yet), the drag still rubber-bands but always snaps back on release since there's nothing to swap to. (As above, this should rarely be hit in practice due to proactive prefetching.)

**Direction disambiguation**: touches starting within the bottom 64px seek-bar band are classified by the dominant direction of the first ~10px of movement — horizontal-dominant is a seek-scrub, vertical-dominant is a swap-swipe (even though it started in the seek band).

### HUD

The HUD sits above all media-containers and contains:

- **Back button**: top-left, left-arrow SVG (hand-rolled inline SVG, no icon library dependency), on a subtle circular background.
- **Fullscreen button**: top-right, 4-square-corners SVG, toggling the real browser Fullscreen API (`requestFullscreen`/`exitFullscreen`) on the Player container, reflecting `fullscreenchange` state. Falls back to a silent no-op where unsupported (e.g. iOS Safari). Becomes a collapse icon when fullscreen is active.
- **Title-time row**: 20px above the seek bar, with 20px side padding. Title on the left, time-remaining on the right (e.g. `-23:15`), plus a small "i" info icon. Tapping "i" opens a tooltip (title, date e.g. "Jan 15, 2026", human-readable filesize, resolution e.g. "1280w x 720h", duration) sourced from `tile.preview.*` (confirmed via backend: `PreviewData.W/H/Filesize/Mdate/Duration` mirror the original Media's stats, not the downscaled preview file). Tapping the "i" icon opens it; while open, a full-screen invisible backdrop captures the next tap anywhere to close it (that tap does not also trigger the zone underneath).
- **Seek bar**: 1px thick, touching the bottom edge, white up to current position and dark gray for the remainder. Images show no seek bar or time-remaining (title/info icon still shown).

**Back/fullscreen button contrast**: two modes — "very-low contrast" (default) and "medium contrast" (while paused). Seeking and swap transitions do not affect this. Circle background also scales from a subtle `rgba(0,0,0,0.15)`-ish value at very-low up to a more opaque `rgba(0,0,0,0.3)`-ish value at medium. Simple 200ms transition between modes.

**Title-time/seek-bar contrast**: two modes, high and low, via opacity only (high ≈ 1, low ≈ 0.35), plus a permanent subtle dark gradient behind the bottom HUD area so text/bar stay legible over bright media even at low opacity. Rules:
- After end-swap (or after the very first Player open, once current media is ready), stays high-contrast for 2s, then fades to low over the next 1s.
- On pause: instantly (no transition) high-contrast; on resume: instantly high, then immediately starts fading to low over the next 1s.
- On any seek (seek-bar tap/drag, or a rewind/FF tap): instantly high-contrast, then immediately starts fading to low over the next 1s. Each rewind/FF tap resets this timer.

During a swap, the seek bar and title-time row fade out over the first 75ms of the swap, then fade back in from mid-swap to end-swap showing the new current media's title.

### Invisible tap zones

- **Seek band**: bottom 64px, full width. Supports both tap and drag-to-scrub (live position preview while dragging, commits on release). The left 20px of padding sets time to 00:00; the right 20px sets it to the end, except seeking can never leave less than 1 second of video remaining — seeking to "the end" actually sets position to `duration - 1s`.
- **Rewind zone**: left 25% of the HUD (excluding the seek band). Tap rewinds by the preset's `rewindSeconds`, applying the seek immediately and cumulatively on every tap. Shows a full-zone black overlay at opacity 0.05 that fades out over 200ms, and centered text ("-10s", "-20s", ... accumulating while taps land within 500ms of each other) that fades out over 500ms. Every new tap within the window resets both fades back to full opacity. Lower precedence than the seek band.
- **Fast-forward zone**: right 25% of the HUD, mirror of rewind (`forwardSeconds`, "+10s" etc.), same overlay/text fade behavior and precedence rules.
- **Pause/play zone**: the remaining middle ~50% (excluding the seek band). Tap toggles pause/play. Also shows the same 200ms-fading black opacity-0.05 overlay across its zone, plus a play or pause SVG icon (matching the new state) centered and fading out over 500ms, with the same per-tap reset behavior as rewind/FF.

Every rewind/FF/pause/play tap also instantly sets title-time/seek-bar to high-contrast and restarts the 1s fade-to-low, per the contrast rules above.
