<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Tile } from '../types'
import { formatClock } from '../format'
import {
  SEEK_BAND_HEIGHT,
  HUD_SIDE_PADDING,
  REWIND_ZONE_RATIO,
  FORWARD_ZONE_RATIO,
  TAP_MOVE_THRESHOLD,
  DIRECTION_DISAMBIGUATION_PX,
  TAP_OVERLAY_OPACITY,
  TAP_OVERLAY_FADE_MS,
  TAP_TEXT_FADE_MS,
  TAP_ACCUMULATE_WINDOW_MS,
  CONTRAST_OPACITY_HIGH,
  CONTRAST_OPACITY_LOW,
  CONTRAST_FADE_MS,
  BUTTON_CONTRAST_TRANSITION_MS,
  BUTTON_BG_LOW_CONTRAST,
  BUTTON_BG_MEDIUM_CONTRAST,
  BUTTON_ICON_OPACITY_LOW_CONTRAST,
  BUTTON_ICON_OPACITY_MEDIUM_CONTRAST,
  SWAP_MID_MS,
} from '../playerConstants'

const props = defineProps<{
  tile: Tile
  currentTime: number
  duration: number
  paused: boolean
  tapToPlayVisible: boolean // shown only when a direct-load autoplay attempt was blocked
  hudFadeVisible: boolean // false during the first 75ms of a swap
  contrastPulse: number // bumped by the parent on swap-end / first-ready
  rewindSeconds: number
  forwardSeconds: number
  viewportW: number
  viewportH: number
  fullscreenTarget: HTMLElement | null
}>()

const emit = defineEmits<{
  back: []
  'swap-drag': [deltaY: number]
  'swap-release': [deltaY: number, velocity: number]
  'seek-preview': [time: number]
  'seek-commit': [time: number]
  rewind: []
  forward: []
  'toggle-play-pause': []
}>()

// --- Title / info tooltip ---
const infoOpen = ref(false)
const title = computed(() => props.tile.path.split('/').pop() ?? props.tile.path)

function formatFilesize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let val = bytes / 1024
  let i = 0
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(1)} ${units[i]}`
}

function formatDate(mdateSeconds: number): string {
  return new Date(mdateSeconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const dateText = computed(() => formatDate(props.tile.mdate))
const filesizeText = computed(() => formatFilesize(props.tile.filesize))
const resolutionText = computed(() => `${props.tile.preview.w}w x ${props.tile.preview.h}h`)
const durationText = computed(() => formatClock(props.tile.duration))

// --- Seek bar / time-remaining, with a live local preview while scrubbing ---
const scrubPreviewTime = ref<number | null>(null)
const displayTime = computed(() => scrubPreviewTime.value ?? props.currentTime)
const seekPct = computed(() => (props.duration ? Math.min(100, Math.max(0, (displayTime.value / props.duration) * 100)) : 0))
const timeRemainingText = computed(() => `-${formatClock(Math.max(0, props.duration - displayTime.value))}`)

// --- Fullscreen ---
const isFullscreen = ref(false)
function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement && document.fullscreenElement === props.fullscreenTarget
}
function toggleFullscreen() {
  const el = props.fullscreenTarget as (HTMLElement & { requestFullscreen?: () => Promise<void> }) | null
  if (!el) return
  if (!document.fullscreenElement) {
    el.requestFullscreen?.().catch(() => {})
  } else {
    document.exitFullscreen?.().catch(() => {})
  }
}
onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

// --- Back/fullscreen button contrast: very-low (default) vs medium (paused) ---
const buttonBg = computed(() => (props.paused ? BUTTON_BG_MEDIUM_CONTRAST : BUTTON_BG_LOW_CONTRAST))
const buttonIconOpacity = computed(() => (props.paused ? BUTTON_ICON_OPACITY_MEDIUM_CONTRAST : BUTTON_ICON_OPACITY_LOW_CONTRAST))

// --- Title-time/seek-bar high/low contrast state machine ---
const hudContrast = ref<'high' | 'low'>('high')
const hudTransitionMs = ref(0)
let holdTimer: ReturnType<typeof setTimeout> | undefined

function setHighThenFade(holdMs: number) {
  clearTimeout(holdTimer)
  hudTransitionMs.value = 0
  hudContrast.value = 'high'
  holdTimer = setTimeout(() => {
    hudTransitionMs.value = CONTRAST_FADE_MS
    hudContrast.value = 'low'
  }, holdMs)
}

function setHighNoFade() {
  clearTimeout(holdTimer)
  hudTransitionMs.value = 0
  hudContrast.value = 'high'
}

// Paused: instantly high, no pending fade. Resumed: instantly high, then
// immediately starts fading (no hold), per spec.
watch(
  () => props.paused,
  (paused) => (paused ? setHighNoFade() : setHighThenFade(0)),
)

// Bumped by the parent after a swap completes, or once the very first
// media is ready — holds high-contrast for a couple seconds first, unless
// already paused (e.g. blocked autoplay), in which case it stays high.
watch(
  () => props.contrastPulse,
  () => (props.paused ? setHighNoFade() : setHighThenFade(2000)),
)

onBeforeUnmount(() => clearTimeout(holdTimer))

const contrastOpacityStyle = computed(() => ({
  opacity: hudContrast.value === 'high' ? CONTRAST_OPACITY_HIGH : CONTRAST_OPACITY_LOW,
  transition: `opacity ${hudTransitionMs.value}ms linear`,
}))

// Bottom gradient follows the same high/low state machine as the title-time
// row and seek bar, but fades all the way to fully transparent in low
// contrast rather than stopping at CONTRAST_OPACITY_LOW.
const gradientOpacityStyle = computed(() => ({
  opacity: hudContrast.value === 'high' ? 1 : 0,
  transition: `opacity ${hudTransitionMs.value}ms linear`,
}))

// --- Tap feedback (rewind / forward / pause-play zones) ---
function createTapFeedback() {
  const hasTapped = ref(false)
  const overlayKey = ref(0)
  const textKey = ref(0)
  const text = ref('')
  let lastTapTime = 0
  let count = 0
  function trigger(label: (count: number) => string) {
    const now = performance.now()
    count = now - lastTapTime <= TAP_ACCUMULATE_WINDOW_MS ? count + 1 : 1
    lastTapTime = now
    text.value = label(count)
    hasTapped.value = true
    overlayKey.value++
    textKey.value++
  }
  return { hasTapped, overlayKey, textKey, text, trigger }
}

const rewindFeedback = createTapFeedback()
const forwardFeedback = createTapFeedback()
const playPauseFeedback = createTapFeedback()

function doRewindTap() {
  if (!props.tile.isVid) return
  emit('rewind')
  setHighThenFade(0)
  rewindFeedback.trigger((n) => `-${n * props.rewindSeconds}s`)
}

function doForwardTap() {
  if (!props.tile.isVid) return
  emit('forward')
  setHighThenFade(0)
  forwardFeedback.trigger((n) => `+${n * props.forwardSeconds}s`)
}

function doPlayPauseTap() {
  if (!props.tile.isVid) return
  emit('toggle-play-pause')
  setHighThenFade(0)
  // Icon shown matches the new state that results from this tap.
  playPauseFeedback.trigger(() => (props.paused ? 'play' : 'pause'))
}

// --- Seek-band tap/scrub geometry ---
function xToTime(x: number): number {
  const w = props.viewportW
  if (x <= HUD_SIDE_PADDING) return 0
  if (x >= w - HUD_SIDE_PADDING) return Math.max(0, props.duration - 1)
  const ratio = (x - HUD_SIDE_PADDING) / (w - 2 * HUD_SIDE_PADDING)
  return Math.min(Math.max(0, props.duration - 1), Math.max(0, ratio * props.duration))
}

// --- Gesture recognition: tap vs swipe-swap vs seek-scrub ---
type Zone = 'seek' | 'rewind' | 'forward' | 'playpause' | 'none'
type GestureMode = 'pending' | 'swap' | 'scrub'

interface Gesture {
  mode: GestureMode
  zone: Zone
  startX: number
  startY: number
  lastX: number
  lastY: number
  startTime: number
}

let gesture: Gesture | null = null

function classifyZone(x: number, y: number): Zone {
  // Images have no timeline to rewind/forward/scrub and no playback to
  // pause, so the whole viewport is a single non-interactive zone (swipe
  // up/down to swap still works via the same non-'seek' gesture path).
  if (!props.tile.isVid) return 'none'
  if (y >= props.viewportH - SEEK_BAND_HEIGHT) return 'seek'
  if (x < props.viewportW * REWIND_ZONE_RATIO) return 'rewind'
  if (x > props.viewportW * (1 - FORWARD_ZONE_RATIO)) return 'forward'
  return 'playpause'
}

function handleTap(zone: Zone, x: number) {
  if (zone === 'none') return
  if (zone === 'seek') {
    setHighThenFade(0)
    emit('seek-commit', xToTime(x))
  } else if (zone === 'rewind') {
    doRewindTap()
  } else if (zone === 'forward') {
    doForwardTap()
  } else {
    doPlayPauseTap()
  }
}

// Mouse clicks (desktop, no touch events) hit the same zones/actions as a
// tap. Real touch taps already call preventDefault() in onTouchEnd, which
// suppresses the browser's synthetic post-touch click, so this only ever
// fires for genuine mouse input.
function onClick(e: MouseEvent) {
  if (infoOpen.value) return
  handleTap(classifyZone(e.clientX, e.clientY), e.clientX)
}

function onTouchStart(e: TouchEvent) {
  if (infoOpen.value) return
  const t = e.touches[0]
  gesture = {
    mode: 'pending',
    zone: classifyZone(t.clientX, t.clientY),
    startX: t.clientX,
    startY: t.clientY,
    lastX: t.clientX,
    lastY: t.clientY,
    startTime: performance.now(),
  }
}

function onTouchMove(e: TouchEvent) {
  if (!gesture) return
  const t = e.touches[0]
  gesture.lastX = t.clientX
  gesture.lastY = t.clientY
  const dx = t.clientX - gesture.startX
  const dy = t.clientY - gesture.startY

  if (gesture.mode === 'pending') {
    if (gesture.zone === 'seek') {
      if (Math.abs(dx) > DIRECTION_DISAMBIGUATION_PX || Math.abs(dy) > DIRECTION_DISAMBIGUATION_PX) {
        gesture.mode = Math.abs(dx) > Math.abs(dy) ? 'scrub' : 'swap'
      }
    } else if (Math.abs(dy) > TAP_MOVE_THRESHOLD) {
      gesture.mode = 'swap'
    }
  }

  if (gesture.mode === 'swap') {
    e.preventDefault()
    emit('swap-drag', dy)
  } else if (gesture.mode === 'scrub') {
    e.preventDefault()
    const time = xToTime(t.clientX)
    scrubPreviewTime.value = time
    emit('seek-preview', time)
  }
}

defineExpose({
  triggerRewind: doRewindTap,
  triggerForward: doForwardTap,
  triggerPlayPause: doPlayPauseTap,
})

function onTouchEnd(e: TouchEvent) {
  if (!gesture) return
  const g = gesture
  gesture = null
  const dx = g.lastX - g.startX
  const dy = g.lastY - g.startY
  const dt = Math.max(1, performance.now() - g.startTime)

  if (g.mode === 'swap') {
    emit('swap-release', dy, dy / dt)
  } else if (g.mode === 'scrub') {
    const time = xToTime(g.lastX)
    scrubPreviewTime.value = null
    setHighThenFade(0)
    emit('seek-commit', time)
  } else if (Math.abs(dx) < TAP_MOVE_THRESHOLD && Math.abs(dy) < TAP_MOVE_THRESHOLD) {
    handleTap(g.zone, g.startX)
  }
  e.preventDefault()
}
</script>

<template>
  <div class="hud">
    <div
      class="zones-layer"
      @click="onClick"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <div
        v-if="rewindFeedback.hasTapped.value"
        :key="'ro' + rewindFeedback.overlayKey.value"
        class="tap-overlay rewind-zone"
        :style="{ '--tap-overlay-opacity': TAP_OVERLAY_OPACITY, animationDuration: TAP_OVERLAY_FADE_MS + 'ms' }"
      />
      <div
        v-if="forwardFeedback.hasTapped.value"
        :key="'fo' + forwardFeedback.overlayKey.value"
        class="tap-overlay forward-zone"
        :style="{ '--tap-overlay-opacity': TAP_OVERLAY_OPACITY, animationDuration: TAP_OVERLAY_FADE_MS + 'ms' }"
      />
      <div
        v-if="playPauseFeedback.hasTapped.value"
        :key="'po' + playPauseFeedback.overlayKey.value"
        class="tap-overlay playpause-zone"
        :style="{ '--tap-overlay-opacity': TAP_OVERLAY_OPACITY, animationDuration: TAP_OVERLAY_FADE_MS + 'ms' }"
      />

      <div
        v-if="rewindFeedback.hasTapped.value"
        :key="'rt' + rewindFeedback.textKey.value"
        class="tap-text rewind-zone"
        :style="{ animationDuration: TAP_TEXT_FADE_MS + 'ms' }"
      >
        {{ rewindFeedback.text.value }}
      </div>
      <div
        v-if="forwardFeedback.hasTapped.value"
        :key="'ft' + forwardFeedback.textKey.value"
        class="tap-text forward-zone"
        :style="{ animationDuration: TAP_TEXT_FADE_MS + 'ms' }"
      >
        {{ forwardFeedback.text.value }}
      </div>
      <div
        v-if="playPauseFeedback.hasTapped.value"
        :key="'pt' + playPauseFeedback.textKey.value"
        class="tap-text playpause-zone icon"
        :style="{ animationDuration: TAP_TEXT_FADE_MS + 'ms' }"
      >
        <svg v-if="playPauseFeedback.text.value === 'play'" class="playpause-icon" viewBox="0 0 24 24" width="64" height="64" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        <svg v-else class="playpause-icon" viewBox="0 0 24 24" width="64" height="64" fill="currentColor"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
      </div>
    </div>

    <button
      class="hud-btn back-btn"
      type="button"
      :style="{ background: buttonBg, transition: `background ${BUTTON_CONTRAST_TRANSITION_MS}ms` }"
      @click="emit('back')"
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        :style="{ opacity: buttonIconOpacity, transition: `opacity ${BUTTON_CONTRAST_TRANSITION_MS}ms` }"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>

    <button
      class="hud-btn fullscreen-btn"
      type="button"
      :style="{ background: buttonBg, transition: `background ${BUTTON_CONTRAST_TRANSITION_MS}ms` }"
      @click="toggleFullscreen"
    >
      <svg
        v-if="!isFullscreen"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        :style="{ opacity: buttonIconOpacity, transition: `opacity ${BUTTON_CONTRAST_TRANSITION_MS}ms` }"
      >
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </svg>
      <svg
        v-else
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        :style="{ opacity: buttonIconOpacity, transition: `opacity ${BUTTON_CONTRAST_TRANSITION_MS}ms` }"
      >
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      </svg>
    </button>

    <div v-if="tapToPlayVisible" class="tap-to-play-hint">tap to play</div>

    <div class="bottom-gradient" :style="gradientOpacityStyle" />

    <div class="bottom-hud" :style="contrastOpacityStyle">
      <div class="swap-fade" :class="{ 'swap-hidden': !hudFadeVisible }" :style="{ transitionDuration: SWAP_MID_MS + 'ms' }">
        <div class="title-time-row">
          <div class="title">{{ title }}</div>
          <div v-if="tile.isVid" class="time-remaining">{{ timeRemainingText }}</div>
          <span class="info-icon-hit" @click.stop="infoOpen = true">
            <span class="info-icon">i</span>
          </span>
        </div>
        <div v-if="tile.isVid" class="seek-bar">
          <div class="seek-fill" :style="{ width: seekPct + '%' }" />
        </div>
      </div>
    </div>

    <div v-if="infoOpen" class="info-backdrop" @click="infoOpen = false">
      <div class="info-tooltip">
        <div class="info-row">{{ title }}</div>
        <div class="info-row">{{ dateText }}</div>
        <div class="info-row">{{ filesizeText }}</div>
        <div class="info-row">{{ resolutionText }}</div>
        <div v-if="tile.isVid" class="info-row">{{ durationText }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}

.zones-layer {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  overflow: hidden;
}

.tap-overlay {
  position: absolute;
  top: 0;
  bottom: 64px;
  background: #000;
  animation-name: tapOverlayFade;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}
.tap-overlay.rewind-zone {
  left: 0;
  width: 25%;
}
.tap-overlay.forward-zone {
  right: 0;
  width: 25%;
}
.tap-overlay.playpause-zone {
  left: 25%;
  right: 25%;
}
@keyframes tapOverlayFade {
  from {
    opacity: var(--tap-overlay-opacity);
  }
  to {
    opacity: 0;
  }
}

.tap-text {
  position: absolute;
  top: 0;
  bottom: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22px;
  font-weight: 600;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  animation-name: tapTextFade;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}
.tap-text.rewind-zone {
  left: 0;
  width: 25%;
}
.tap-text.forward-zone {
  right: 0;
  width: 25%;
}
.tap-text.playpause-zone {
  left: 25%;
  right: 25%;
}
.playpause-icon {
  filter: drop-shadow(0 1px 4px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 8px rgba(0, 0, 0, 0.4));
}
@keyframes tapTextFade {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.hud-btn {
  position: absolute;
  top: 8px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
  z-index: 6;
}
.back-btn {
  left: 8px;
}
.fullscreen-btn {
  right: 8px;
}

.bottom-gradient {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0));
  pointer-events: none;
}

.tap-to-play-hint {
  position: absolute;
  left: 0;
  right: 0;
  top: 55%;
  transform: translateY(-50%);
  text-align: center;
  color: #fff;
  font-size: 28px;
  font-weight: 600;
  opacity: 0.5;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

.bottom-hud {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.swap-fade {
  opacity: 1;
  transition-property: opacity;
  transition-timing-function: linear;
}
.swap-fade.swap-hidden {
  opacity: 0;
}

.title-time-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 20px;
  margin-bottom: 11px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  gap: 6px;
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info-icon-hit {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  position: relative;
  top: -2px;
  padding: 8px;
  margin: -8px;
  pointer-events: auto;
  cursor: pointer;
}
.info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid #fff;
  font-size: 9px;
  font-style: italic;
}
.time-remaining {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.seek-bar {
  height: 1px;
  margin: 0 20px;
  background: rgba(120, 120, 120, 0.8);
}
.seek-fill {
  height: 100%;
  background: #fff;
}

.info-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  z-index: 7;
}
.info-tooltip {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 100px;
  background: rgba(20, 20, 20, 0.92);
  color: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
}
.info-row {
  padding: 2px 0;
}
</style>
