<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import type { Tile, TitleMode, VideoTier } from '../types'
import type { TileSource } from '../tilePlayback'
import { mediaUrl, thumbnailUrl, highlightUrl, spriteUrl } from '../api/shuffle'
import { formatClock } from '../format'
import { titleParts } from '../pathUtils'
import { resolveTileSource } from '../tilePlayback'
import { playerStore } from '../stores/playerStore'
import { urlStore } from '../stores/urlStore'
import { presetsStore } from '../stores/presetsStore'
import { videoLoadQueue } from '../stores/videoLoadQueue'
import { tileInteractionStore } from '../stores/tileInteractionStore'
import { selectionStore } from '../stores/selectionStore'

const props = defineProps<{
  tile: Tile
  rowi: number
  rowH: number
  cropX: number
  cropY: number
  videoTileInitial: VideoTier
  videoTileInteract: VideoTier
  spriteFps: number
  titleMode: TitleMode
  titleExt: boolean
}>()

const hovering = computed(() => tileInteractionStore.isActive(props.tile.tilei))

// Crop-then-letterbox hybrid: scale the preview to cover the box, but never
// crop more than cropX/cropY of that axis — if covering would need more, the
// scale backs off toward "contain" on that axis and the remainder is
// letterboxed instead of cropped.
const mediaStyle = computed(() => {
  const boxW = props.tile.w
  const boxH = props.rowH
  const pw = props.tile.preview.w
  const ph = props.tile.preview.h
  const boxAspect = boxW / boxH
  const previewAspect = pw / ph

  let scale: number
  if (previewAspect >= boxAspect) {
    // image relatively wider than box: height fits, width may need cropping
    const coverScale = boxH / ph
    const neededCropX = 1 - boxW / (pw * coverScale)
    if (neededCropX <= props.cropX) {
      scale = coverScale
    } else {
      scale = boxW / (pw * (1 - props.cropX))
    }
  } else {
    // image relatively taller than box: width fits, height may need cropping
    const coverScale = boxW / pw
    const neededCropY = 1 - boxH / (ph * coverScale)
    if (neededCropY <= props.cropY) {
      scale = coverScale
    } else {
      scale = boxH / (ph * (1 - props.cropY))
    }
  }

  const scaledW = pw * scale
  const scaledH = ph * scale
  return {
    width: `${scaledW}px`,
    height: `${scaledH}px`,
    left: `${(boxW - scaledW) / 2}px`,
    top: `${(boxH - scaledH) / 2}px`,
  }
})

const source = computed(() =>
  resolveTileSource({
    isVid: props.tile.isVid,
    hasThumbnail: props.tile.preview.hasThumbnail,
    hasHighlight: props.tile.preview.hasHighlight,
    hasSprite: !!props.tile.preview.sprite,
    videoTileInitial: props.videoTileInitial,
    videoTileInteract: props.videoTileInteract,
    hovering: hovering.value,
  }),
)

const isVideoPlaying = computed(() => source.value === 'highlight')

// Brief ↻ icon marking each sprite/highlight loop. Bumping the key
// remounts the icon, restarting its CSS animation.
const flashKey = ref(0)
function triggerFlash() {
  flashKey.value++
}

// Sprite playback: steps through the sheet's cells at spriteFps, row-major.
const spriteGrid = computed(() => props.tile.preview.sprite ?? { rows: 1, cols: 1 })
const spriteFrame = ref(0)
let spriteTimer: ReturnType<typeof setInterval> | undefined
function stopSpriteTimer() {
  clearInterval(spriteTimer)
  spriteTimer = undefined
}
watch(
  [source, () => props.spriteFps],
  () => {
    stopSpriteTimer()
    if (source.value !== 'sprite') return
    spriteFrame.value = 0
    const frames = spriteGrid.value.rows * spriteGrid.value.cols
    spriteTimer = setInterval(() => {
      spriteFrame.value = (spriteFrame.value + 1) % frames
      if (spriteFrame.value === 0 && frames > 1) triggerFlash()
    }, 1000 / Math.max(props.spriteFps, 0.1))
  },
  { immediate: true },
)
const spriteProgress = computed(() => {
  const frames = spriteGrid.value.rows * spriteGrid.value.cols
  // Mirrors backend SpriteFrameTime: frame i sits at (i+1)/(n+1) of the video.
  return `${((spriteFrame.value + 1) / (frames + 1)) * 100}%`
})
const spriteImgStyle = computed(() => {
  const { rows, cols } = spriteGrid.value
  const col = spriteFrame.value % cols
  const row = Math.floor(spriteFrame.value / cols)
  return {
    width: `${cols * 100}%`,
    height: `${rows * 100}%`,
    left: `${-col * 100}%`,
    top: `${-row * 100}%`,
  }
})

// Bumped (via selectionStore) to force a fresh network request after a successful in-app
// delete, bypassing the browser cache — otherwise the tile would keep
// showing its already-loaded preview instead of flipping to the "failed to
// load" state, which would be misleading about whether the delete worked.
const cacheBust = computed(() => selectionStore.state.bust[props.tile.tilei] ?? 0)
function withCacheBust(url: string): string {
  return cacheBust.value ? `${url}${url.includes('?') ? '&' : '?'}_=${cacheBust.value}` : url
}

const videoSrc = computed(() => withCacheBust(highlightUrl(props.tile.path)))
const spriteSrc = computed(() => withCacheBust(spriteUrl(props.tile.path)))
const imgSrc = computed(() => withCacheBust(source.value === 'thumbnail' ? thumbnailUrl(props.tile.path) : mediaUrl(props.tile.path)))
// Base layer shown behind a playing video, so the thumbnail stays visible
// (instead of a black gap) until the video has an actual frame to paint.
const thumbSrc = computed(() => withCacheBust(thumbnailUrl(props.tile.path)))

// True once the playing video has decoded its first frame — gates the
// video's fade-in so the thumbnail/placeholder base layer shows through
// while it's still buffering over the network.
const videoReady = ref(false)
watch(videoSrc, () => {
  videoReady.value = false
})
watch(isVideoPlaying, (active) => {
  if (!active) videoReady.value = false
})

// Tracks whether the currently-attempted source failed to load (e.g. the
// file was deleted/renamed, or the shufflelist's stale "//deleted" sentinel
// path). Only one network request is ever attempted per tile — there's no
// fallback chain after a failure, just this message in place of the preview.
const loadFailed = ref(false)
const failedSource = ref<TileSource | null>(null)
const currentSrc = computed(() => (isVideoPlaying.value ? videoSrc.value : source.value === 'sprite' ? spriteSrc.value : imgSrc.value))
watch(currentSrc, () => {
  loadFailed.value = false
})

function onMediaError() {
  loadFailed.value = true
  failedSource.value = source.value
  queueMarkSettled()
}

// `loop` videos never fire `ended`, so detect the wrap by mediaTime going
// backwards between presented frames.
let loopVideo: HTMLVideoElement | undefined
let loopLastTime = -1
let loopCallbackId: number | undefined
function watchLoop(video: HTMLVideoElement) {
  if (loopVideo === video || !('requestVideoFrameCallback' in video)) return
  loopVideo = video
  const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
    if (loopLastTime >= 0 && meta.mediaTime < loopLastTime) triggerFlash()
    loopLastTime = meta.mediaTime
    loopCallbackId = video.requestVideoFrameCallback(onFrame)
  }
  loopCallbackId = video.requestVideoFrameCallback(onFrame)
}

function onVideoLoaded(e: Event) {
  queueMarkSettled()
  videoReady.value = true
  loopLastTime = -1
  watchLoop(e.target as HTMLVideoElement)
}

// Row-level load gate: this tile's video is only allowed to actually fetch
// (i.e. have its `src` bound) once every row above it has finished loading
// its own videos. `queuePending` mirrors whether this tile is currently
// registered as one of its row's outstanding loads.
const queuePending = ref(false)
const rowUnlocked = computed(() => videoLoadQueue.isRowUnlocked(props.rowi))

function queueMarkPending() {
  if (!queuePending.value) {
    queuePending.value = true
    videoLoadQueue.markPending(props.rowi)
  }
}

function queueMarkSettled() {
  if (queuePending.value) {
    queuePending.value = false
    videoLoadQueue.markSettled(props.rowi)
  }
}

watch(
  isVideoPlaying,
  (active) => {
    if (active) {
      queueMarkPending()
    } else {
      queueMarkSettled()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (loopCallbackId !== undefined) loopVideo?.cancelVideoFrameCallback(loopCallbackId)
  stopSpriteTimer()
  queueMarkSettled()
  tileInteractionStore.end(props.tile.tilei)
})

const failedMessage = computed(() => {
  if (failedSource.value === 'thumbnail') return 'failed to load thumbnail'
  if (failedSource.value === 'highlight') return 'failed to load highlight'
  if (failedSource.value === 'sprite') return 'failed to load sprite'
  if (failedSource.value === 'original') return 'failed to load image'
  return ''
})

const title = computed(() => titleParts(props.tile.path, props.titleMode, props.titleExt, presetsStore.selectedPreset.value?.basePath ?? ''))

const durationText = computed(() => formatClock(props.tile.duration))

const selected = computed(() => selectionStore.isSelected(props.tile.tilei))
const selecting = computed(() => selectionStore.isActive())

// Set when a long-press just entered multi-select, so the click that
// follows the finger lifting doesn't immediately toggle the tile back off.
let suppressClick = false
let suppressTimer: ReturnType<typeof setTimeout> | undefined

function onClick() {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (selecting.value) selectionStore.toggle(props.tile)
  else urlStore.openTile(props.tile.tilei)
}

function onHoverStart() {
  tileInteractionStore.start(props.tile.tilei)
}

function onHoverEnd() {
  tileInteractionStore.end(props.tile.tilei)
}

function suppressNextClick() {
  suppressClick = true
  clearTimeout(suppressTimer)
  suppressTimer = setTimeout(() => (suppressClick = false), 600)
}

// Right-click, and the native contextmenu event on Android long-press:
// enters multi-select, or toggles the tile if already selecting.
function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  if (selecting.value) selectionStore.toggle(props.tile)
  else selectionStore.enter(props.tile)
  // A touch long-press is followed by a click on release; a mouse right-click isn't.
  if ((e as PointerEvent).pointerType !== 'mouse') suppressNextClick()
}

// iOS Safari never fires contextmenu on long-press, so also time it manually.
const LONG_PRESS_MS = 500
let pressTimer: ReturnType<typeof setTimeout> | undefined

function cancelPress() {
  clearTimeout(pressTimer)
}

function onTouchStart() {
  onHoverStart()
  cancelPress()
  if (selecting.value) return
  pressTimer = setTimeout(() => {
    selectionStore.enter(props.tile)
    suppressNextClick()
  }, LONG_PRESS_MS)
}

function onTouchEnd() {
  onHoverEnd()
  cancelPress()
}

onUnmounted(() => {
  cancelPress()
  clearTimeout(suppressTimer)
})
</script>

<template>
  <div
    class="tile"
    :class="{ selected }"
    :style="{ width: tile.w + 'px', height: rowH + 'px' }"
    @click="onClick"
    @mouseenter="onHoverStart"
    @mouseleave="onHoverEnd"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="cancelPress"
    @touchcancel.passive="onTouchEnd"
    @touchend.passive="onTouchEnd"
    @contextmenu="onContextMenu"
  >
    <template v-if="!playerStore.state.previewsHidden">
      <div v-if="loadFailed" class="load-failed">{{ failedMessage }}</div>
      <template v-else>
        <template v-if="isVideoPlaying">
          <img
            v-if="tile.preview.hasThumbnail"
            :src="thumbSrc"
            :style="mediaStyle"
            :alt="tile.path"
          />
          <div v-else class="placeholder" :style="mediaStyle" />
          <video
            :src="rowUnlocked ? videoSrc : undefined"
            :style="mediaStyle"
            :class="{ ready: videoReady }"
            muted
            playsinline
            loop
            autoplay
            @error="onMediaError"
            @loadeddata="onVideoLoaded"
          />
        </template>
        <div v-else-if="source === 'sprite'" class="sprite" :style="mediaStyle">
          <img :src="spriteSrc" :style="spriteImgStyle" :alt="tile.path" @error="onMediaError" />
        </div>
        <img
          v-else-if="source !== 'placeholder'"
          :src="imgSrc"
          :style="mediaStyle"
          :alt="tile.path"
          loading="lazy"
          @error="onMediaError"
        />
        <div v-else class="placeholder" :style="mediaStyle" />
      </template>
      <div v-if="source === 'sprite' && !loadFailed" class="sprite-progress">
        <div class="sprite-progress-fill" :style="{ width: spriteProgress }" />
      </div>
      <div v-if="flashKey" :key="flashKey" class="loop-icon">↻</div>
      <div v-if="tile.isVid" class="duration-badge">{{ durationText }}</div>
      <div class="title-overlay">
        <div v-if="title.top" class="title-parent">{{ title.top }}</div>
        <div class="title-main">{{ title.bottom }}</div>
      </div>
    </template>

    <template v-if="selecting">
      <div v-if="selected" class="select-border" />
      <div class="select-check" :class="{ on: selected }">
        <svg v-if="selected" viewBox="0 0 16 16" width="17" height="17"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tile {
  position: relative;
  overflow: hidden;
  background: #000;
  cursor: pointer;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
}

.select-border {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: 5px solid #2d7cff;
  pointer-events: none;
  z-index: 2;
}

.select-check {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 22px;
  height: 22px;
  box-sizing: border-box;
  border: 2px solid #fff;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 3;
}

.select-check.on {
  border: none;
  background: #2d7cff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}

.tile img,
.tile video,
.tile .placeholder {
  position: absolute;
  object-fit: fill;
}

.tile .sprite {
  position: absolute;
  overflow: hidden;
}

.tile .sprite img {
  position: absolute;
}

.tile video {
  background: transparent;
  opacity: 0;
  transition: opacity 150ms ease;
}

.tile video.ready {
  opacity: 1;
}

.sprite-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 2px;
  height: 2px;
  background: rgba(128, 128, 128, 0.55);
  pointer-events: none;
  z-index: 1;
}

.sprite-progress-fill {
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
}

.loop-icon {
  position: absolute;
  top: 4px;
  left: 6px;
  color: #fff;
  font-size: 20px;
  line-height: 1;
  text-shadow: 0 0 3px #000, 0 0 6px rgba(0, 0, 0, 0.8);
  pointer-events: none;
  animation: loop-icon 500ms ease-out forwards;
}

@keyframes loop-icon {
  from { opacity: 1; }
  to { opacity: 0; }
}

.placeholder {
  background: #555;
}

.load-failed {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8rem;
  overflow-wrap: break-word;
}

.duration-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 1px 6px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 13px;
  border-radius: 3px;
  pointer-events: none;
}

.title-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px 6px 4px;
  color: #fff;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0));
  pointer-events: none;
}

.title-parent {
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title-main {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
