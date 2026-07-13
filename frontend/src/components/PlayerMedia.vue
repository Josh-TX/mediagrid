<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Tile } from '../types'
import { mediaUrl } from '../api/shuffle'

const props = defineProps<{
  tile: Tile
  cropX: number
  cropY: number
  viewportW: number
  viewportH: number
}>()

const emit = defineEmits<{
  loaded: []
  timeupdate: [currentTime: number, duration: number]
  ended: []
  play: []
  pause: []
  'autoplay-blocked': []
  error: []
}>()

const videoEl = ref<HTMLVideoElement | null>(null)
// Set once and never reset — a container's tile never changes over its
// lifetime (see Player.vue's ContainerEntry), so there's nothing to recover
// into once a load fails.
const failed = ref(false)

// Same crop-then-letterbox hybrid as Tile.vue's mediaStyle, but against the
// full viewport box and the source Media's own dimensions (preview.w/h
// mirror the original Media, per PreviewData), driven by playerCropX/Y.
const mediaStyle = computed(() => {
  const boxW = props.viewportW
  const boxH = props.viewportH
  const pw = props.tile.preview.w
  const ph = props.tile.preview.h
  const boxAspect = boxW / boxH
  const mediaAspect = pw / ph

  let scale: number
  if (mediaAspect >= boxAspect) {
    const coverScale = boxH / ph
    const neededCropX = 1 - boxW / (pw * coverScale)
    if (neededCropX <= props.cropX) {
      scale = coverScale
    } else {
      scale = boxW / (pw * (1 - props.cropX))
    }
  } else {
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

function onLoadedData() {
  emit('loaded')
}

function onError() {
  failed.value = true
  emit('error')
}

function onTimeUpdate() {
  if (videoEl.value) emit('timeupdate', videoEl.value.currentTime, videoEl.value.duration)
}

// A stop-ended video sitting at currentTime === duration needs an explicit
// seek back to 0 before play() — otherwise play() is a no-op since there's
// nothing left to play. Applying that rule here means every call site (mid-
// swap activation, resuming via the pause/play zone, loop-mode restart) can
// just call play() uniformly.
function play() {
  const v = videoEl.value
  if (!v) return
  if (v.duration && v.currentTime >= v.duration - 0.05) {
    v.currentTime = 0
  }
  // If the browser refuses (e.g. no user-gesture on a direct URL load), no
  // native 'play' event ever fires — emit 'pause' so the caller's paused
  // state reflects what actually happened instead of what was requested,
  // plus a distinct event so the caller can offer a "tap to play" hint.
  v.play().catch(() => {
    if (v.paused) {
      emit('pause')
      emit('autoplay-blocked')
    }
  })
}

function pause() {
  videoEl.value?.pause()
}

function seek(time: number) {
  if (videoEl.value) videoEl.value.currentTime = time
}

function getCurrentTime(): number {
  return videoEl.value?.currentTime ?? 0
}

function getDuration(): number {
  return videoEl.value?.duration ?? 0
}

function isPaused(): boolean {
  return videoEl.value?.paused ?? true
}

function isEnded(): boolean {
  return videoEl.value?.ended ?? false
}

defineExpose({ play, pause, seek, getCurrentTime, getDuration, isPaused, isEnded })
</script>

<template>
  <div class="media-container">
    <div v-if="failed" class="load-failed">{{ tile.isVid ? 'failed to load video' : 'failed to load image' }}</div>
    <template v-else>
      <video
        v-if="tile.isVid"
        ref="videoEl"
        :src="mediaUrl(tile.path)"
        :style="mediaStyle"
        playsinline
        preload="auto"
        @loadeddata="onLoadedData"
        @timeupdate="onTimeUpdate"
        @ended="emit('ended')"
        @play="emit('play')"
        @pause="emit('pause')"
        @error="onError"
      />
      <img
        v-else
        :src="mediaUrl(tile.path)"
        :style="mediaStyle"
        :alt="tile.path"
        @load="onLoadedData"
        @error="onError"
      />
    </template>
  </div>
</template>

<style scoped>
.media-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #000;
}

.media-container img,
.media-container video {
  position: absolute;
  object-fit: fill;
}

.load-failed {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1rem;
  overflow-wrap: break-word;
}
</style>
