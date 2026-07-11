// All tunable numbers for the Player feature live here so timings/thresholds/
// opacities can be tweaked without hunting through component code.

// --- Open/close + swap animation ---
export const SLIDE_DURATION_MS = 150 // Player open/close slide-in/out
export const SWAP_DURATION_MS = 150 // full swipe/scroll/key swap animation
export const SWAP_MID_MS = 75 // when the underlying media logically swaps

// --- Touch swipe ---
export const SWAP_COMMIT_RATIO = 0.2 // fraction of viewport height to commit a drag
export const SWAP_FLICK_VELOCITY = 0.5 // px/ms; a fast-enough flick also commits
export const TAP_MOVE_THRESHOLD = 10 // px of movement before a touch is treated as a drag, not a tap
export const DIRECTION_DISAMBIGUATION_PX = 10 // px of movement in the seek band before axis is locked

// --- Desktop scroll/keys ---
export const WHEEL_DELTA_THRESHOLD = 30 // px of wheel delta to trigger a discrete swap
export const WHEEL_COOLDOWN_MS = 400 // cooldown after a wheel-triggered swap before another can fire

// --- Rubber-banding (dragging toward an end that doesn't exist) ---
export const RUBBER_BAND_STRENGTH = 0.55 // 0-1, lower = stronger resistance

// --- HUD contrast: back/fullscreen buttons ---
export const BUTTON_CONTRAST_TRANSITION_MS = 200
export const BUTTON_BG_LOW_CONTRAST = 'rgba(0, 0, 0, 0.12)'
export const BUTTON_BG_MEDIUM_CONTRAST = 'rgba(0, 0, 0, 0.22)'
export const BUTTON_ICON_OPACITY_LOW_CONTRAST = 0.5
export const BUTTON_ICON_OPACITY_MEDIUM_CONTRAST = 0.85
export const HUD_BUTTON_SIZE = 34 // px, back/fullscreen circle diameter
export const HUD_BUTTON_CORNER_OFFSET = 8 // px, distance from top/side edge

// --- HUD contrast: title-time row + seek bar ---
export const CONTRAST_OPACITY_HIGH = 1
export const CONTRAST_OPACITY_LOW = 0.35
export const CONTRAST_HIGH_HOLD_MS = 2000 // how long high-contrast holds after a swap/open before fading
export const CONTRAST_FADE_MS = 1000 // fade-to-low duration

// --- Layout ---
export const SEEK_BAND_HEIGHT = 64 // px, bottom band shared by seek + direction disambiguation
export const HUD_SIDE_PADDING = 20 // px, title-time row + seek bar side padding
export const TITLE_ROW_OFFSET = 11 // px, title-time row sits this far above the seek bar
export const REWIND_ZONE_RATIO = 0.25 // left fraction of HUD (excluding seek band)
export const FORWARD_ZONE_RATIO = 0.25 // right fraction of HUD (excluding seek band)

// --- Rewind/forward/pause-play tap feedback ---
export const TAP_OVERLAY_OPACITY = 0.05
export const TAP_OVERLAY_FADE_MS = 200
export const TAP_TEXT_FADE_MS = 500
export const TAP_ACCUMULATE_WINDOW_MS = 500 // taps within this window accumulate instead of resetting

// --- Prefetch ---
export const PREFETCH_ROW_BUFFER = 2 // start loading more once within this many loaded rows of the end
