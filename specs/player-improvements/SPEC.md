# Player Improvements

## Description

I want several improvements to the Player, all driven by new Preset settings. The changes touch the Preset schema, database, settings UI, and the Player component itself.

### Rename videoCropMaxX/Y → playerCropMaxX/Y

The existing `videoCropMaxX` and `videoCropMaxY` Preset fields must be renamed to `playerCropMaxX` and `playerCropMaxY` everywhere: the shared `Preset` type in `packages/types`, the database schema, `DEFAULT_PRESET` in `backend/src/db.ts`, and all UI labels in `SettingsModal.tsx`. These fields now represent cropping in the Player view, and they apply to all media types (images and videos alike).

### New Preset fields

Add three new fields to the `Preset` type and database schema:

- `forwardPreloadCount`: integer, choices 1/2/3, default 1
- `backwardPreloadCount`: integer, choices 1/2/3, default 1
- `oneFileAtATime`: boolean, default false

The database can be wiped and recreated — there is no existing data to preserve. Just drop and recreate all tables.

### Settings UI restructuring

In the Presets tab of `SettingsModal.tsx`:

- Rename the existing "Layout" section to "Gallery". Tile crop fields (`tileCropMaxX`, `tileCropMaxY`) remain in this section.
- Add a new "Playback" section containing:
  - `forwardPreloadCount` dropdown (options: 1, 2, 3)
  - `backwardPreloadCount` dropdown (options: 1, 2, 3)
  - `oneFileAtATime` checkbox
  - `playerCropMaxX` dropdown (same `CROP_OPTIONS` as tile crop)
  - `playerCropMaxY` dropdown (same `CROP_OPTIONS` as tile crop)

When `oneFileAtATime` is checked, the `forwardPreloadCount` and `backwardPreloadCount` dropdowns disappear and are replaced by a static "1" label. The actual stored values are preserved in the preset — only the UI hides them. The Player's logic ignores the stored preload counts and uses 1 whenever `oneFileAtATime` is true.

### Passing preset to Player

The active Preset object is already loaded in the Gallery component. Pass the relevant preset fields to `Player` as props: `forwardPreloadCount`, `backwardPreloadCount`, `oneFileAtATime`, `playerCropMaxX`, `playerCropMaxY`.

### Preload count changes

Replace the `FORWARD_PRELOAD_COUNT = 2` and `BACKWARD_PRELOAD_COUNT = 2` constants in `Player.tsx` with values derived from the preset props. When `oneFileAtATime` is true, treat both as 1 regardless of the stored values. `TOTAL_SLOTS` and `CURRENT_SLOT_IDX` must be computed dynamically from the effective counts.

### One File At A Time (OFOAT) mode

When `oneFileAtATime` is false (default), the Player behaves as it does today: items are stacked tightly edge-to-edge, so landscape media bleeds adjacent items into view.

When `oneFileAtATime` is true, a fundamentally different layout and animation approach is used.

**Slot count:** Effective preload counts are both 1 (`TOTAL_SLOTS = 3`, `CURRENT_SLOT_IDX = 1`), regardless of the stored preset values.

**Resting layout (OFOAT):** Items are positioned in absolute visual coordinates, independent of `baseYRef`:
- Slot 0 (prev): `top = -prevH` — bottom edge flush with viewport top (y=0), just above view
- Slot 1 (current): `top = vpH/2 - currH/2` — vertically centered
- Slot 2 (next): `top = vpH` — top edge flush with viewport bottom, just below view

**State:** A new `itemTops: number[] | null` React state holds the absolute visual top of each slot during commit animation. Between animations, items use `restingOfoatTops` computed inline from `allDims` each render.

**Drag (OFOAT):** The `.stack` wrapper's `translateY` is `dragOffset` (no `restingTranslateY` offset). All items move together as one unit. Items' `top` values come from `restingOfoatTops` at rest.

**New state:** `ofoatAnimating: boolean` — when true, items use `itemTops` state with CSS `transition: top 0.3s ease`; when false, items use `restingOfoatTops` with no CSS transition.

**Commit animation (OFOAT):**

1. **Block input:** Set `animatingRef.current = true`.
2. **Snapshot:** Compute `snapshotTops[i] = restingOfoatTops[i] + dragOffset` for each slot.
3. **Collapse:** Set `itemTops = snapshotTops`, `ofoatAnimating = false`, `dragOffset = 0`, `animating = false`. Items now use `itemTops` but without CSS transition — no visual change, stack translateY collapses to 0.
4. **Wait one frame** (`requestAnimationFrame`): ensures the snapshot render is committed before transitions fire.
5. **Animate:** Set `ofoatAnimating = true`, set `itemTops = targetTops`:
   - Forward (`direction=1`): `[−allDims[1].height, vpH/2 − allDims[2].height/2, vpH]`
   - Backward (`direction=-1`): `[−vpH, vpH/2 − allDims[0].height/2, vpH]`
   
   (`−vpH` for the new loading slot, which has `fallbackDims.height = vpH`.)
6. **Settle (300ms):** Set `ofoatAnimating = false`, `itemTops = null`, shift `slots`, update `currentIndex`. Render uses `restingOfoatTops` computed from new `allDims` — positions match targets, so no visual jump.
7. **Fetch edge:** Load the new far slot (one slot beyond the new window edge) and update slots.

**Snap-back (OFOAT):** Same as non-OFOAT: `setAnimating(true)`, `setDragOffset(0)` — the `.stack.animating { transition: transform }` CSS smoothly returns the stack translateY to 0. Items stay at `restingOfoatTops`.

**CSS:** Add `.itemOfoatAnimating { transition: top 0.3s ease }` to `Player.module.css`. Apply this class to each `.item` when `ofoatAnimating === true`.

**Stack translateY:**
- Non-OFOAT: `restingTranslateY + dragOffset` (existing behavior)
- OFOAT: `dragOffset` only (resting positions already expressed in visual coordinates)

The swipe commit threshold stays as `0.5 × currDims.height` in both modes.

### Player crop (playerCropMaxX/Y)

Extend `computeDims` to accept `playerCropMaxX` and `playerCropMaxY` and expand media beyond the viewport when those values are non-zero. The `.player` container already has `overflow: hidden`, so clipping is handled automatically.

Use the same scale-then-cap logic as tile cropping:

- If `mediaAR < deviceAR` (portrait media in a landscape-relative viewport): expand toward filling viewport width (crops top/bottom). `imgH = vpW / mediaAR`. `maxImgH = playerCropMaxY >= 0.5 ? Infinity : vpH / (1 - 2 * playerCropMaxY)`. `imgH_final = min(imgH, maxImgH)`. `imgW_final = imgH_final * mediaAR`. `offsetX = (vpW - imgW_final) / 2`.

- If `mediaAR >= deviceAR` (landscape media in a portrait-relative viewport): expand toward filling viewport height (crops left/right). `imgW = vpH * mediaAR`. `maxImgW = playerCropMaxX >= 0.5 ? Infinity : vpW / (1 - 2 * playerCropMaxX)`. `imgW_final = min(imgW, maxImgW)`. `imgH_final = imgW_final / mediaAR`. `offsetX = (vpW - imgW_final) / 2` (will be negative when cropping).

When `offsetX` is negative, the `.item` div's `left` value is negative and the media extends beyond the left edge of the player — clipped correctly by `overflow: hidden`. Cropping applies in both OFOAT and non-OFOAT modes.
