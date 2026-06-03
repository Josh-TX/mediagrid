# Video Tile Type Preset Setting

## Description

I want two new fields on the Preset: `videoTileType` and `videoFallbackToOriginal`. These control how video Media is displayed in Gallery Tiles.

### videoTileType

A three-value enum (stored as a string literal on Preset):

- `"thumbnail-only"` — video tiles always show the thumbnail (or placeholder if none). Highlights are never shown regardless of availability.
- `"touch-to-highlight"` — video tiles show the thumbnail by default. On desktop, hovering triggers the highlight to play; hover-end stops the video and instantly snaps back to the thumbnail. On mobile, tapping starts the highlight; it keeps playing until the tile scrolls out of view, the Player opens, or the user taps a different video tile (only one tile may play at a time in this mode). When the interaction ends on mobile, the tile reverts to the thumbnail.
- `"highlight-if-available"` — current behavior; the highlight autoplays (muted, looping, via IntersectionObserver) if one exists, otherwise falls back to thumbnail, then placeholder. Multiple tiles may play simultaneously. This is the default value for new and existing presets.

### videoFallbackToOriginal

A boolean (default: `false`). When `true`, if a video tile needs a highlight (per the `videoTileType` setting) but no highlight file exists, the original video file is used in its place — bypassing the thumbnail entirely. This applies to both `"highlight-if-available"` (original autoplays) and `"touch-to-highlight"` (original plays on hover/touch). The user accepts the performance tradeoff of streaming large original files in gallery tiles.

This field is only meaningful when `videoTileType` is not `"thumbnail-only"`. The settings UI should hide or disable this checkbox when `videoTileType === "thumbnail-only"`.

### Triangle indicator (touch-to-highlight mode only)

In `"touch-to-highlight"` mode, video tiles that have a highlight available (or have a fallback-to-original that would play) should render a small white filled triangle SVG in the top-right corner of the tile. This triangle is an affordance indicating interactivity. It should disappear while the highlight (or fallback original) is actively playing, and reappear when the tile reverts to thumbnail.

### Architecture note

Currently `resolvePreviewType()` in `backend/src/router.ts` collapses availability into a single `previewType` value per tile. The `"touch-to-highlight"` mode requires the frontend to independently know whether a highlight exists and whether a thumbnail exists, because the tile must show the thumbnail by default and switch to the highlight (or original) on interaction.

`PreviewInfo` (in `packages/types/src/index.ts`) should be extended with a `hasHighlight` boolean field alongside the existing `previewType`. The backend sets `hasHighlight: true` whenever a highlight file exists on disk for that Media item, regardless of what `previewType` resolves to. The frontend uses `hasHighlight` (together with the preset's `videoTileType` and `videoFallbackToOriginal`) to determine what to render and whether to show the triangle indicator.

For the "original" fallback case when the original is a video (not an image), the frontend must render a `<video>` element (muted, looping, with IntersectionObserver-based autoplay for `"highlight-if-available"` mode, or interaction-driven for `"touch-to-highlight"` mode). Currently `previewType: "original"` implies an image; the frontend must handle the case where `media_type === 1` and the tile is rendering original as a video.

## Out of Scope

- The `"highlight-if-available"` multi-play behavior is unchanged; no one-at-a-time constraint is added to that mode.
- The `videoTileType` and `videoFallbackToOriginal` settings do not affect image tiles; images continue to use their existing thumbnail-or-original logic.
- No transition or fade animation when switching between thumbnail and highlight; the switch is instant.
