# Seek Amount Unit Type

## Description

I want to rename the existing `rewindSeconds` and `fastForwardSeconds` preset fields to `rewindAmount` and `fastForwardAmount` everywhere — in the `Preset` type (`packages/types/src/index.ts`), the backend DB schema and `DEFAULT_PRESET` (`backend/src/db.ts`), and throughout the frontend. The rename communicates that the value is a magnitude whose unit is determined separately.

I want two new boolean preset fields: `isRewindPercent` and `isForwardPercent`, both defaulting to `false`. When `false`, the existing seconds-based seek behavior is unchanged. When `true`, the seek delta is computed as `Math.round(video.duration * amount / 100)` instead of using the raw amount as seconds. This percentage mode applies to both edge taps and arrow-key seeking in the Player.

The `rewindAmount` / `fastForwardAmount` values are unit-agnostic — their numeric value persists unchanged when the user switches unit type. There is no min/max enforcement based on mode; `min={1}` remains as before.

### Settings Modal

In the Playback section of `SettingsModal.tsx`, replace the two existing rows with four rows in this order:

1. **"Rewind unit type"** — a `<select>` with options "Seconds" and "Percentage", bound to `isRewindPercent` (false = Seconds, true = Percentage).
2. **"Rewind seconds"** / **"Rewind percent"** — label changes dynamically based on `isRewindPercent`; `<NumberInput>` bound to `rewindAmount`.
3. **"Fast-forward unit type"** — same pattern, bound to `isForwardPercent`.
4. **"Fast-forward seconds"** / **"Fast-forward percent"** — dynamic label, bound to `fastForwardAmount`.

### Player Overlay

The `useTapOverlays` hook in `playerHooks.ts` currently accumulates seconds and displays e.g. "+10s". When in percent mode, the overlay still shows the computed seconds ("+7s"), but also shows the accumulated percentage in smaller subtle text below — e.g. "10%" after one tap, "20%" after two taps within the accumulation window. The percentage accumulates the same way seconds do (each tap adds `amount` to the running total, reset after 500ms).

### Database Migration

The DB column rename requires migration. Follow the existing migration pattern in `db.ts` (try/catch ALTER TABLE). Rename `rewindSeconds` → `rewindAmount` and `fastForwardSeconds` → `fastForwardAmount` using `ALTER TABLE preset RENAME COLUMN`. Add the two new boolean columns `isRewindPercent` and `isForwardPercent` with `DEFAULT 0`.
