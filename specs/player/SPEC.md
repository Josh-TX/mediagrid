# Player

## Description

I want a Player view that lets me view a single Media item at full viewport, navigating through the Shuffle by swiping up and down. The Player is always present in the DOM, positioned off-screen to the right, and slides into view when I tap a Tile in the Gallery. It slides back out to the right when I press the back button. The Gallery is frozen (no new fetches, no scroll interactions) while the Player is open.

### Opening the Player

When I tap a Tile, the Gallery passes the following to the Player: the tile's shuffle index, the current seed, the current search query (`q`), and the active preset name. The Player slides in from the right via a CSS transform transition. On open, it immediately fetches MediaInfo for indexes `[n-1, n, n+1]` in a single API call.

### New API Endpoint

A new backend endpoint `GET /api/media-info?r=<seed>&indexes=0,1,2&q=<query>&preset=<name>` returns an array of `MediaInfo` objects (one per requested index, `null` for out-of-range indexes). The backend applies the same SimpleFilter, PresetFilter, and seeded shuffle as `GET /api/blocks`. `MediaInfo` is a new shared type with fields: `path`, `width`, `height`, `duration` (null for images), `media_type`.

### Layout

The Player fills the full viewport. The three items — previous, current, next — are stacked vertically in a single column with no gaps. The previous item is above the current, the next item is below. The current item is always centered in the viewport. Items are sized using `object-fit: contain` logic computed in JavaScript:

- If `mediaAspectRatio >= deviceAspectRatio` (media is landscape relative to the device): the item is `100vw` wide and `viewportWidth / mediaAspectRatio` tall, centered vertically in the viewport. In this case neighbors bleed into the visible viewport above and below.
- If `mediaAspectRatio < deviceAspectRatio` (media is portrait relative to the device): the item is `100vh` tall and `viewportHeight * mediaAspectRatio` wide, centered horizontally. In this case the item fills the full viewport height and no neighbors are visible.

Items in the stack are always edge-to-edge: the bottom edge of the previous item touches the top edge of the current item, and the bottom edge of the current item touches the top edge of the next item. The stack is then translated vertically so the current item is centered in the viewport.

When a neighbor's `MediaInfo` has not yet loaded, a loading spinner is shown in its place.

### Rolling Window

The Player maintains a rolling window of exactly three `MediaInfo` items: `[prev, current, next]`. When the user advances to a new item (e.g. current becomes `n+1`), the new current is `n+1`, prev is `n`, next is `n+2`. The item that fell out of the window (`n-1`) is discarded, and a single fetch is made for the newly needed item (`n+2`). This keeps memory usage bounded.

### Swipe Gesture

The swipe gesture moves the entire three-item stack as one unit — all items translate together. Touch events drive the drag. A swipe commits (advances to the adjacent item) if either:

- The drag velocity exceeds `SWIPE_VELOCITY_THRESHOLD` (default `0.5` px/ms) — a fast flick
- The drag distance exceeds `SWIPE_COMMIT_THRESHOLD` (default `0.5`) × the current item's rendered height

Both constants are defined at the top of the Player source file for easy tuning.

On commit: the stack animates to its new centered position (new current is centered), the window rolls, and a fetch is made for the new neighbor. On snap-back: the stack animates back to its resting position (current item centered).

### Wrap-Around

The shuffle wraps around: swiping down past index 0 goes to the last item, swiping up past the last item goes to index 0. When a wrap occurs, a toast notification is shown to indicate it. (This toast is useful for debugging and may be removed later.)

### Video Playback

When the current item is a video, it autoplays with audio and loops. It continues playing during a drag gesture. When a swipe commits and a new current item becomes active, the previous video stops and the new current video (if any) begins playing. There is no mute control.

### Back Button

An absolutely-positioned back button sits in the top-left corner of the Player with some padding. It is a solid white SVG left-arrow icon. Tapping it slides the Player back out to the right, revealing the Gallery exactly as it was left (scroll position preserved, no state reset).

### Toast Infrastructure

The existing toast in `Gallery.tsx` is hardcoded to a single "Failed to load media" message. Refactor the toast to support an arbitrary message string, then use it for both the existing error case and the new wrap-around notification.

## Out of Scope

- Fullscreen API (`requestFullscreen`) — the Player fills the viewport but does not invoke the browser fullscreen API
- A mute/unmute control
- Highlighting the tapped Gallery tile while the Player is open
- Persisting the Player's position (shuffle index) across page reloads
