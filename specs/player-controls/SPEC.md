# Player Controls

## Description

I want to add interactive playback controls to the Player: tap zones for rewind/play-pause/fast-forward, a seek bar for videos, a fullscreen toggle button, and two new Preset fields (`rewindSeconds`, `fastForwardSeconds`). The back button position also changes.

### New Preset fields

Add two new integer fields to the `Preset` type in `packages/types/src/index.ts` and to the database schema in `backend/src/db.ts`:

- `rewindSeconds`: integer, default 10
- `fastForwardSeconds`: integer, default 10

Because there is no existing data to preserve, drop and recreate all DB tables. Add both fields to `DEFAULT_PRESET`.

In `SettingsModal.tsx`, add two number inputs for `rewindSeconds` and `fastForwardSeconds` under the existing "Playback" settings section (no min/max enforcement).

Pass `rewindSeconds` and `fastForwardSeconds` as props to the `Player` component alongside the existing preset props.

### Back button

Move the back button from 16px to 8px away from the top and left edges. Reduce its background opacity from `rgba(0,0,0,0.35)` to `rgba(0,0,0,0.2)`. The active state darkens to `rgba(0,0,0,0.5)` (was 0.6).

### Fullscreen toggle button

Add a fullscreen toggle button in the top-right corner of the Player, styled identically to the back button: `rgba(0,0,0,0.2)` background, 8px from the top and right edges, `z-index: 10`, same padding and border-radius.

- In normal (non-fullscreen) mode, display the Unicode character ⛶ (U+26F6, Square Four Corners) as the icon.
- In fullscreen mode, display an × (times/close) icon instead.

Use the native browser Fullscreen API (`document.requestFullscreen()` / `document.exitFullscreen()`) with a `fullscreenchange` event listener to track state. The fullscreen button is visible for all media types (images and videos). When the back button is pressed while in native fullscreen, it should close the Player without exiting fullscreen — leaving the fullscreen state intact.

### Tap zones (rewind / play-pause / fast-forward)

Divide the Player viewport into four equal horizontal columns (25% each) and wire `onClick` on the Player container (not the stack) to handle tap events. The browser's native click-from-touch handles tap vs. swipe disambiguation automatically.

- **Left 25%**: rewind the current video by `rewindSeconds`, clamped to 0.
- **Right 25%**: fast-forward the current video by `fastForwardSeconds`, clamped to the video duration.
- **Middle 50%** (columns 2 and 3): toggle play/pause on the current video.
- If the current media is an image, taps do nothing.

### Tap feedback overlays

Each of the three tap zones has its own independent overlay, centered within that zone. Overlays are absolutely positioned above all content (`z-index: 20`), pointer-events none.

When a tap fires:

- The rewind zone shows a text overlay like `−10s` (using `rewindSeconds`).
- The fast-forward zone shows `+10s` (using `fastForwardSeconds`).
- The play/pause zone shows an SVG icon: a filled right-pointing triangle for play, two filled vertical rectangles for pause. Each icon is simple geometric (not Material Design).

Overlay animation:
- Define two source-code constants: `OVERLAY_FADE_DURATION_MS = 600` and `OVERLAY_ACCUMULATE_MS = 500`.
- On first tap, the overlay appears instantly at full opacity and begins fading to 0 over `OVERLAY_FADE_DURATION_MS` ms.
- If another tap in the same zone occurs within `OVERLAY_ACCUMULATE_MS` ms of the previous tap, the value accumulates (e.g. tapping rewind twice shows `−20s`), the overlay snaps back to full opacity, and the `OVERLAY_FADE_DURATION_MS` fade restarts.
- After `OVERLAY_ACCUMULATE_MS` ms with no additional tap in the zone, the accumulated count resets for the next tap.
- Separate accumulation state per zone (rewind / play-pause / forward).
- The play/pause zone does not accumulate — each tap shows the current icon and restarts the fade independently.

### Seek bar (videos only)

Render a seek bar for videos. It is not shown when the current media is an image. If changing from image to video or vice versa, begin the CSS opacity fade-in/out as soon as `onTouchEnd` fires (i.e. when the user releases the drag), not after the navigation animation completes.

**Visual:**
- A 1px-tall horizontal bar positioned with `position: fixed`, 48px from the bottom of the viewport.
- The bar's active (hit) area is the full viewport width but only 32px tall (16px above and 16px below the 1px line).
- Left and right sides have 32px of visual padding — the 1px bar is not drawn there.
- The portion of the bar left of the current playback position uses a slightly more opaque white (e.g. `rgba(255,255,255,0.5)`).
- The portion right of the current position uses a mostly transparent white (e.g. `rgba(255,255,255,0.2)`).
- When the user is actively tapping or dragging the seek bar, both portions transition to a higher opacity (e.g. `rgba(255,255,255,0.8)` and `rgba(255,255,255,0.4)`) over 300ms.
- After the user releases or lifts, they transition back to normal opacity over 300ms.

**Tap behavior:**
- Tapping within the 32px hit area (but within the left 32px padding zone) seeks to position 0.
- Tapping within the right 32px padding zone seeks to the end of the video.
- Tapping anywhere else in the hit area seeks to the proportional position within the bar's visual width.

**Drag / scrub behavior:**
- If a drag starts within the 32px hit area, horizontal movement continuously updates the video's `currentTime` (scrubbing). The video remains in the play state during scrubbing.
- Scrubbing position clamps to 0 when the finger moves into the left 32px padding zone, and clamps to the end when in the right 32px padding zone.
- If a drag starting in the seek bar hit area has fast vertical velocity (exceeding `SWIPE_VELOCITY_THRESHOLD`), the swipe navigation still triggers as normal.

**Seek bar updates:**
- Update the visual bar position using the `timeupdate` event on the video element (no `requestAnimationFrame` loop needed).

**Seek bar vs. tap zones:**
- The seek bar hit area takes priority over the tap zone `onClick`. Taps and drags that begin within the seek bar hit area do not trigger rewind/play-pause/fast-forward.

## Out of Scope

- Animating seek bar position to match media during aspect ratio mismatches.
- Any Gallery-level fullscreen toggle (planned for a future spec).
- Timestamps or duration labels on the seek bar.
