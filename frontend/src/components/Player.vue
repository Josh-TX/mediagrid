<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PlayerMedia from './PlayerMedia.vue'
import PlayerHud from './PlayerHud.vue'
import { playerStore } from '../stores/playerStore'
import { generalSettingsStore } from '../stores/generalSettingsStore'
import { urlStore } from '../stores/urlStore'
import {
  SWAP_DURATION_MS,
  SWAP_MID_MS,
  SWAP_COMMIT_RATIO,
  SWAP_FLICK_VELOCITY,
  WHEEL_DELTA_THRESHOLD,
  WHEEL_COOLDOWN_MS,
  RUBBER_BAND_STRENGTH,
  OPEN_MID_MS,
} from '../playerConstants'

interface ContainerEntry {
  id: number
  mediaIndex: number
}

const rootEl = ref<HTMLElement | null>(null)
const hudRef = ref<InstanceType<typeof PlayerHud> | null>(null)
const viewportW = ref(window.innerWidth)
const viewportH = ref(window.innerHeight)
function onResize() {
  viewportW.value = window.innerWidth
  viewportH.value = window.innerHeight
}

const general = computed(() => generalSettingsStore.state.activeGeneral)
const cropX = computed(() => general.value.playerCropX)
const cropY = computed(() => general.value.playerCropY)
const rewindSeconds = computed(() => general.value.rewindSeconds)
const forwardSeconds = computed(() => general.value.forwardSeconds)
const onVidEnd = computed(() => general.value.onVidEnd)

const mediaList = playerStore.mediaList
const currentTile = computed(() => mediaList.value[playerStore.state.currentIndex])

// Role (-1 prev / 0 current / 1 next) is always derived from the delta
// between a container's fixed mediaIndex and the store's currentIndex —
// swapping is just moving currentIndex, roles/positions fall out for free.
let nextId = 0
const containers = ref<ContainerEntry[]>([])
const mediaRefs = new Map<number, InstanceType<typeof PlayerMedia>>()

function roleOf(mediaIndex: number): number {
  return mediaIndex - playerStore.state.currentIndex
}

function currentEntryOf(list: ContainerEntry[]): ContainerEntry | undefined {
  return list.find((c) => roleOf(c.mediaIndex) === 0)
}
const currentEntry = computed(() => currentEntryOf(containers.value))

function containerStyle(entry: ContainerEntry) {
  const role = roleOf(entry.mediaIndex)
  const y = role * viewportH.value + dragOffset.value
  return { transform: `translateY(${y}px)`, zIndex: role === 0 ? 2 : 1 }
}

function ensureNeighbors() {
  const cur = playerStore.state.currentIndex
  const list = mediaList.value
  if (cur + 1 < list.length && !containers.value.some((c) => c.mediaIndex === cur + 1)) {
    containers.value.push({ id: nextId++, mediaIndex: cur + 1 })
  }
  if (cur - 1 >= 0 && !containers.value.some((c) => c.mediaIndex === cur - 1)) {
    containers.value.push({ id: nextId++, mediaIndex: cur - 1 })
  }
}

function syncContainers() {
  containers.value = containers.value.filter((c) => Math.abs(roleOf(c.mediaIndex)) <= 1)
  ensureNeighbors()
}

function setMediaRef(entry: ContainerEntry, el: unknown) {
  const instance = el as InstanceType<typeof PlayerMedia> | null
  if (!instance) {
    mediaRefs.delete(entry.id)
    return
  }
  // Vue re-invokes inline function refs on every parent re-render, not just
  // on mount — without this guard, any reactive update (e.g. the timeupdate-
  // driven currentTime tick, or paused itself flipping on the pause event)
  // would re-run the priming logic below and call .play() again, making
  // pause impossible to sustain.
  const isNewBinding = mediaRefs.get(entry.id) !== instance
  mediaRefs.set(entry.id, instance)
  if (!isNewBinding) return
  // The container starts off fully offscreen (slide-in still in progress),
  // and browsers can refuse to autoplay a video that isn't visible yet, so
  // the play attempt is held until the slide is roughly half done — same
  // timing the swap animation already uses for its own mid-point.
  if (roleOf(entry.mediaIndex) === 0) {
    const tile = mediaList.value[entry.mediaIndex]
    if (tile?.isVid) {
      paused.value = true
      // Only this very first autoplay attempt (tile-tap or direct URL load)
      // is eligible to show the "tap to play" hint on failure.
      initialAutoplayEntryId = entry.id
      setTimeout(() => {
        if (mediaRefs.get(entry.id) === instance) instance.play()
      }, OPEN_MID_MS)
    }
  }
}

// --- Playback state mirrored from the active (role 0) container ---
const paused = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const neighborsCreated = ref(false)
const contrastPulse = ref(0)
const tapToPlayVisible = ref(false)
let initialAutoplayEntryId: number | null = null

function onMediaLoaded(entry: ContainerEntry) {
  if (roleOf(entry.mediaIndex) !== 0 || neighborsCreated.value) return
  neighborsCreated.value = true
  ensureNeighbors()
  duration.value = mediaRefs.get(entry.id)?.getDuration() ?? 0
  contrastPulse.value++
}

function onAutoplayBlocked(entry: ContainerEntry) {
  if (entry.id === initialAutoplayEntryId) tapToPlayVisible.value = true
}

function onTimeUpdate(entry: ContainerEntry, ct: number, dur: number) {
  if (roleOf(entry.mediaIndex) !== 0) return
  currentTime.value = ct
  if (dur && !Number.isNaN(dur)) duration.value = dur
}

function onMediaPlay(entry: ContainerEntry) {
  if (roleOf(entry.mediaIndex) === 0) {
    paused.value = false
    tapToPlayVisible.value = false
  }
}

function onMediaPause(entry: ContainerEntry) {
  if (roleOf(entry.mediaIndex) !== 0) return
  // A video reaching its end fires a native 'pause' just before 'ended'. In
  // 'next'/'loop' modes that's about to be immediately superseded (by the
  // swap or the replay), so treating it as a real pause here would flash the
  // HUD to high-contrast for an instant right as the swap-out fade starts.
  // 'stop' mode has no such follow-up, so the pause is real there.
  const ref = mediaRefs.get(entry.id)
  if (ref?.isEnded() && onVidEnd.value !== 'stop') return
  paused.value = true
}

function onEnded(entry: ContainerEntry) {
  if (roleOf(entry.mediaIndex) !== 0) return
  const mode = onVidEnd.value
  if (mode === 'loop') {
    mediaRefs.get(entry.id)?.play()
  } else if (mode === 'next') {
    triggerDiscreteSwap(1)
  }
  // 'stop': the video already paused itself on its last frame; nothing to do.
}

function togglePlayPause() {
  const entry = currentEntry.value
  const ref = entry && mediaRefs.get(entry.id)
  if (currentTile.value?.isVid && ref) {
    if (ref.isPaused()) ref.play()
    else ref.pause()
  } else {
    paused.value = !paused.value
  }
}

function onSeekCommit(time: number) {
  const entry = currentEntry.value
  const ref = entry && mediaRefs.get(entry.id)
  ref?.seek(time)
  currentTime.value = time
}

function onRewind() {
  const entry = currentEntry.value
  const ref = entry && mediaRefs.get(entry.id)
  if (!ref) return
  const t = Math.max(0, ref.getCurrentTime() - rewindSeconds.value)
  ref.seek(t)
  currentTime.value = t
}

function onForward() {
  const entry = currentEntry.value
  const ref = entry && mediaRefs.get(entry.id)
  if (!ref) return
  const dur = ref.getDuration() || duration.value
  const t = Math.min(Math.max(0, dur - 1), ref.getCurrentTime() + forwardSeconds.value)
  ref.seek(t)
  currentTime.value = t
}

// --- Swap physics: a single dragOffset shared by every container, plus
// the fixed baseline (role * viewportH) each container computes itself. ---
const dragOffset = ref(0)
const swapLocked = ref(false)
const hudFadeVisible = ref(true)
let animFrame: number | null = null

function canSwap(direction: 1 | -1): boolean {
  return direction === 1 ? playerStore.canGoNext.value : playerStore.canGoPrev.value
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// Diminishing resistance for dragging toward an end that doesn't exist —
// approaches but never reaches a full viewport height of travel.
function rubberBand(dy: number): number {
  const vh = viewportH.value
  const sign = dy < 0 ? -1 : 1
  const abs = Math.abs(dy)
  return sign * vh * (1 - 1 / (abs / (vh * RUBBER_BAND_STRENGTH) + 1))
}

function onSwapDrag(dy: number) {
  if (swapLocked.value) return
  const direction: 1 | -1 = dy < 0 ? 1 : -1
  dragOffset.value = canSwap(direction) ? clamp(dy, -viewportH.value, viewportH.value) : rubberBand(dy)
}

function onSwapRelease(dy: number, velocity: number) {
  if (swapLocked.value) return
  const direction: 1 | -1 = dy < 0 ? 1 : -1
  const passedThreshold =
    Math.abs(dy) > viewportH.value * SWAP_COMMIT_RATIO || Math.abs(velocity) > SWAP_FLICK_VELOCITY
  if (passedThreshold && canSwap(direction)) {
    animateSwap(direction, dragOffset.value)
  } else {
    snapBack()
  }
}

function snapBack() {
  swapLocked.value = true
  const startOffset = dragOffset.value
  const startTime = performance.now()
  function frame(now: number) {
    const t = Math.min(now - startTime, SWAP_DURATION_MS)
    dragOffset.value = startOffset * (1 - t / SWAP_DURATION_MS)
    if (t < SWAP_DURATION_MS) {
      requestAnimationFrame(frame)
    } else {
      dragOffset.value = 0
      swapLocked.value = false
    }
  }
  requestAnimationFrame(frame)
}

// The instant currentIndex changes (mid-swap), every container's baseline
// shifts by one viewportH (since role = mediaIndex - currentIndex) — we
// nudge dragOffset by the same amount so the visual position doesn't jump,
// then keep animating the (now renormalized) offset down to 0.
function doMidSwap(direction: 1 | -1) {
  const before = dragOffset.value
  if (direction === 1) playerStore.goNext()
  else playerStore.goPrev()
  urlStore.onSwap()
  dragOffset.value = before + direction * viewportH.value

  syncContainers()
  currentTime.value = 0
  duration.value = 0
  tapToPlayVisible.value = false

  containers.value.forEach((c) => {
    const ref = mediaRefs.get(c.id)
    if (!ref) return
    if (roleOf(c.mediaIndex) === 0) {
      const tile = mediaList.value[c.mediaIndex]
      duration.value = ref.getDuration() ?? 0
      if (tile?.isVid) ref.play()
      paused.value = false
    } else {
      ref.pause()
    }
  })

  contrastPulse.value++
}

function animateSwap(direction: 1 | -1, startOffset: number) {
  swapLocked.value = true
  hudFadeVisible.value = false
  const vh = viewportH.value
  const preRemapTarget = -direction * vh
  const startTime = performance.now()
  let remapped = false
  let postRemapStart = 0

  function frame(now: number) {
    const t = Math.min(now - startTime, SWAP_DURATION_MS)
    if (!remapped && t >= SWAP_MID_MS) {
      remapped = true
      doMidSwap(direction)
      postRemapStart = dragOffset.value
      hudFadeVisible.value = true
    }
    if (t < SWAP_MID_MS) {
      const progress = t / SWAP_DURATION_MS
      dragOffset.value = startOffset + progress * (preRemapTarget - startOffset)
    } else {
      const remainT = t - SWAP_MID_MS
      const remainDur = SWAP_DURATION_MS - SWAP_MID_MS
      dragOffset.value = postRemapStart * (1 - remainT / remainDur)
    }
    if (t < SWAP_DURATION_MS) {
      animFrame = requestAnimationFrame(frame)
    } else {
      dragOffset.value = 0
      swapLocked.value = false
      animFrame = null
    }
  }
  animFrame = requestAnimationFrame(frame)
}

function triggerDiscreteSwap(direction: 1 | -1) {
  if (swapLocked.value || !canSwap(direction)) return
  dragOffset.value = 0
  animateSwap(direction, 0)
}

// --- Desktop input: wheel is a discrete trigger with a cooldown, keys too ---
let wheelCooldown = false
function onWheel(e: WheelEvent) {
  if (wheelCooldown || swapLocked.value) return
  if (Math.abs(e.deltaY) < WHEEL_DELTA_THRESHOLD) return
  wheelCooldown = true
  setTimeout(() => (wheelCooldown = false), WHEEL_COOLDOWN_MS)
  triggerDiscreteSwap(e.deltaY > 0 ? 1 : -1)
}

function close() {
  urlStore.closePlayer()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    triggerDiscreteSwap(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    triggerDiscreteSwap(-1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    hudRef.value?.triggerRewind()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    hudRef.value?.triggerForward()
  } else if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault()
    hudRef.value?.triggerPlayPause()
  }
}

// On a direct load (page opened with `i` already in the URL), the Player is
// mounted open before its /api/shuffle fetch resolves, so mediaList starts
// out empty — until then, containers stays empty and the Player just shows
// its plain black background (doubling as the "loading" state). A watcher
// picks up the tile once the fetch populates mediaList.
function initContainersIfReady() {
  if (containers.value.length > 0) return
  if (!mediaList.value[playerStore.state.currentIndex]) return
  containers.value = [{ id: nextId++, mediaIndex: playerStore.state.currentIndex }]
}

const stopMediaListWatch = watch(mediaList, initContainersIfReady)

onMounted(() => {
  initContainersIfReady()
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeydown)
  if (animFrame !== null) cancelAnimationFrame(animFrame)
  stopMediaListWatch()
})
</script>

<template>
  <div ref="rootEl" class="player" @wheel="onWheel">
    <div class="containers">
      <div v-for="entry in containers" :key="entry.id" class="container-slot" :style="containerStyle(entry)">
        <PlayerMedia
          :ref="(el) => setMediaRef(entry, el)"
          :tile="mediaList[entry.mediaIndex]"
          :crop-x="cropX"
          :crop-y="cropY"
          :viewport-w="viewportW"
          :viewport-h="viewportH"
          @loaded="onMediaLoaded(entry)"
          @timeupdate="(ct, dur) => onTimeUpdate(entry, ct, dur)"
          @ended="onEnded(entry)"
          @play="onMediaPlay(entry)"
          @pause="onMediaPause(entry)"
          @autoplay-blocked="onAutoplayBlocked(entry)"
        />
      </div>
    </div>

    <PlayerHud
      v-if="currentTile"
      ref="hudRef"
      :tile="currentTile"
      :current-time="currentTime"
      :duration="duration"
      :paused="paused"
      :tap-to-play-visible="tapToPlayVisible"
      :hud-fade-visible="hudFadeVisible"
      :contrast-pulse="contrastPulse"
      :rewind-seconds="rewindSeconds"
      :forward-seconds="forwardSeconds"
      :viewport-w="viewportW"
      :viewport-h="viewportH"
      :fullscreen-target="rootEl"
      @back="close"
      @swap-drag="onSwapDrag"
      @swap-release="onSwapRelease"
      @seek-commit="onSeekCommit"
      @rewind="onRewind"
      @forward="onForward"
      @toggle-play-pause="togglePlayPause"
    />
  </div>
</template>

<style scoped>
.player {
  position: fixed;
  inset: 0;
  z-index: 40;
  overflow: hidden;
  background: #000;
  touch-action: none;
}

.containers {
  position: absolute;
  inset: 0;
}

.container-slot {
  position: absolute;
  inset: 0;
}
</style>
