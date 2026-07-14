<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import type { Tile } from '../types'
import type { TileSource } from '../tilePlayback'
import { mediaUrl, thumbnailUrl, highlightUrl } from '../api/shuffle'
import { formatClock } from '../format'
import { splitNameExt } from '../pathUtils'
import { resolveTileSource } from '../tilePlayback'
import { playerStore } from '../stores/playerStore'
import { urlStore } from '../stores/urlStore'
import { videoLoadQueue } from '../stores/videoLoadQueue'
import { tileInteractionStore } from '../stores/tileInteractionStore'
import TileContextMenu from './TileContextMenu.vue'
import FileInfoModal from './FileInfoModal.vue'

const props = defineProps<{
  tile: Tile
  rowi: number
  rowH: number
  cropX: number
  cropY: number
  tilePreviewAlways: boolean
  fallbackToOriginal: boolean
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
    tilePreviewAlways: props.tilePreviewAlways,
    fallbackToOriginal: props.fallbackToOriginal,
    hovering: hovering.value,
  }),
)

// 'original' means "play the original video" when the tile is a video, or
// "load the original image" when it isn't — only isVid disambiguates it.
const isVideoPlaying = computed(() => source.value === 'highlight' || (source.value === 'original' && props.tile.isVid))

// Incremented to force a fresh network request after a successful in-app
// delete, bypassing the browser cache — otherwise the tile would keep
// showing its already-loaded preview instead of flipping to the "failed to
// load" state, which would be misleading about whether the delete worked.
const cacheBust = ref(0)
function withCacheBust(url: string): string {
  return cacheBust.value ? `${url}${url.includes('?') ? '&' : '?'}_=${cacheBust.value}` : url
}

const videoSrc = computed(() => withCacheBust(source.value === 'highlight' ? highlightUrl(props.tile.path) : mediaUrl(props.tile.path)))
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
const currentSrc = computed(() => (isVideoPlaying.value ? videoSrc.value : imgSrc.value))
watch(currentSrc, () => {
  loadFailed.value = false
})

function onMediaError() {
  loadFailed.value = true
  failedSource.value = source.value
  queueMarkSettled()
}

function onVideoLoaded() {
  queueMarkSettled()
  videoReady.value = true
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
  queueMarkSettled()
  tileInteractionStore.end(props.tile.tilei)
})

const failedMessage = computed(() => {
  if (failedSource.value === 'thumbnail') return 'failed to load thumbnail'
  if (failedSource.value === 'highlight') return 'failed to load highlight'
  if (failedSource.value === 'original') return props.tile.isVid ? 'failed to load video' : 'failed to load image'
  return ''
})

const filename = computed(() => props.tile.path.split('/').pop() ?? props.tile.path)

const title = computed(() => splitNameExt(filename.value).base)

const durationText = computed(() => formatClock(props.tile.duration))

function onClick() {
  urlStore.openTile(props.tile.tilei)
}

function onHoverStart() {
  tileInteractionStore.start(props.tile.tilei)
}

function onHoverEnd() {
  tileInteractionStore.end(props.tile.tilei)
}

const menuOpen = ref(false)
const menuPos = ref({ x: 0, y: 0 })

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  menuPos.value = { x: e.clientX, y: e.clientY }
  menuOpen.value = true
}

function onMenuOpen() {
  menuOpen.value = false
  onClick()
}

const infoOpen = ref(false)

function onMenuInfo() {
  menuOpen.value = false
  infoOpen.value = true
}
</script>

<template>
  <div
    class="tile"
    :style="{ width: tile.w + 'px', height: rowH + 'px' }"
    @click="onClick"
    @mouseenter="onHoverStart"
    @mouseleave="onHoverEnd"
    @touchstart.passive="onHoverStart"
    @touchend.passive="onHoverEnd"
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
      <div v-if="tile.isVid" class="duration-badge">{{ durationText }}</div>
      <div class="title-overlay">{{ title }}</div>
    </template>

    <TileContextMenu
      v-if="menuOpen"
      :x="menuPos.x"
      :y="menuPos.y"
      @click.stop
      @contextmenu.stop
      @open="onMenuOpen"
      @info="onMenuInfo"
      @close="menuOpen = false"
    />

    <FileInfoModal
      v-if="infoOpen"
      :tile="tile"
      @click.stop
      @contextmenu.stop
      @close="infoOpen = false"
      @deleted="cacheBust++"
    />
  </div>
</template>

<style scoped>
.tile {
  position: relative;
  overflow: hidden;
  background: #000;
  cursor: pointer;
}

.tile img,
.tile video,
.tile .placeholder {
  position: absolute;
  object-fit: fill;
}

.tile video {
  background: transparent;
  opacity: 0;
  transition: opacity 150ms ease;
}

.tile video.ready {
  opacity: 1;
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
  font-size: 0.75rem;
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
  font-size: 0.8rem;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
</style>
