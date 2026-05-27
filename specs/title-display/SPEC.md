# Title Display

## Description

I want to display the media title (the filename without its extension, derived from the last path segment) in both the Player and the Gallery.

### Player — Layout

The seek bar should be repositioned to sit 4px from the bottom edge of the viewport (instead of the current 48px). Its side padding should be 12px on each side (instead of 32px). The seek bar is still video-only.

A title + time row sits permanently just above the seek bar, with 8px of space between the row and the seek bar. For images (no seek bar), the title row sits at the same absolute bottom position it would occupy for videos — i.e., the title's vertical position does not change based on whether there is a seek bar. The title row has 12px of horizontal side padding.

The title is left-aligned and truncates with an ellipsis if it overflows. The time remaining is right-aligned on the same line, formatted as `-1:23`. Both share the same row.

### Player — Contrast / Subtle Mode

There are two visibility modes for the Player's bottom overlay (seek bar, title, time):

**Contrast mode**: a `rgba(0,0,0,0.15)` black overlay is rendered across the bottom portion of the viewport (covering the title + seek bar area), and the title, time, and seek bar controls are at 100% opacity.

**Subtle mode**: the black overlay is fully transparent (0% opacity), and the title, time, and seek bar are at 70% opacity.

Transitions between modes use CSS opacity transitions. The contrast mode holds for 1500ms then fades to subtle over 1000ms.

**Triggers that force contrast mode:**
- Opening the Player (treated as a media change)
- Changing to a different media item (swipe commit)
- Unpausing (pressing play)
- Interacting with the seek bar (tap-to-seek or drag-scrub)
- Tapping anywhere while in subtle mode

**Pause**: while the video is paused, contrast mode is held indefinitely (the 1500ms timer does not start or is cancelled).

**Tap toggle**: tapping a non-interactive area of the Player while in contrast mode immediately snaps to subtle mode. Tapping while in subtle mode enters contrast mode and starts the 1500ms timer. Taps on action zones (rewind, play/pause, fast-forward) and the seek bar always force contrast mode via their own triggers — they do not toggle to subtle.

### Player — Media Transition Fade

When the user commits a swipe (lifts finger after a gesture), the title, time-remaining, and seek bar should all fade out over 150ms and then fade back in over 150ms, for a total of 300ms — synchronized with the existing 300ms media transition animation. The content that fades in reflects the new media item (new title, reset time).

### Gallery — Tile Title

A new boolean Preset field `showTileTitle` (default: `true`) controls whether tile titles are shown in the Gallery. This field must be added to the Preset schema (types package), persisted in the backend, and exposed as a toggle in the Gallery section of the Settings modal's Presets tab.

When enabled, each tile displays the media title (filename without extension) at the bottom of the tile:
- Left-aligned, 4px side padding
- White text, truncated with ellipsis on overflow
- A gradient overlay fades from `rgba(0,0,0,0)` at the top to approximately `rgba(0,0,0,0.55)` at the bottom, spanning a fixed ~35px from the tile's bottom edge — this provides contrast for the text without covering too much of the tile

### Gallery — Dynamic Font Size

The title font size scales with the computed tile pixel width, in discrete 2px steps, so nearby tile widths get the same font size:

| Tile width (px) | Font size |
|---|---|
| < 100 | 10px |
| 100 – 179 | 12px |
| 180 – 279 | 14px |
| ≥ 280 | 16px |

The `tileW` value already computed in the `Block` component (`tile.width * galleryWidthPx`) should be used directly for this bucketing.

## Out of Scope

- Storing or editing titles separately from filenames — the title is always derived client-side from the `path` field
- Any title display in the Toolbar or settings views
