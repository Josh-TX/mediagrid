<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Tile, AutoPlayTile } from '../types'
import { mediaUrl, thumbnailUrl, highlightUrl } from '../api/shuffle'
import { formatClock } from '../format'
import { resolveTileSource } from '../tilePlayback'
import { playerStore } from '../stores/playerStore'
import { urlStore } from '../stores/urlStore'

const props = defineProps<{
  tile: Tile
  rowH: number
  cropX: number
  cropY: number
  autoPlayTile: AutoPlayTile
  fallbackToOriginal: boolean
}>()

const hovering = ref(false)

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
    autoPlayTile: props.autoPlayTile,
    fallbackToOriginal: props.fallbackToOriginal,
    hovering: hovering.value,
  }),
)

// 'original' means "play the original video" when the tile is a video, or
// "load the original image" when it isn't — only isVid disambiguates it.
const isVideoPlaying = computed(() => source.value === 'highlight' || (source.value === 'original' && props.tile.isVid))

const videoSrc = computed(() => (source.value === 'highlight' ? highlightUrl(props.tile.path) : mediaUrl(props.tile.path)))
const imgSrc = computed(() => (source.value === 'thumbnail' ? thumbnailUrl(props.tile.path) : mediaUrl(props.tile.path)))

const title = computed(() => {
  const filename = props.tile.path.split('/').pop() ?? props.tile.path
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
})

const durationText = computed(() => formatClock(props.tile.duration))

function onClick() {
  urlStore.openTile(props.tile.tilei)
}

function onHoverStart() {
  hovering.value = true
}

function onHoverEnd() {
  hovering.value = false
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
  >
    <template v-if="!playerStore.state.previewsHidden">
      <video
        v-if="isVideoPlaying"
        :src="videoSrc"
        :style="mediaStyle"
        muted
        playsinline
        loop
        autoplay
      />
      <img v-else-if="source !== 'placeholder'" :src="imgSrc" :style="mediaStyle" :alt="tile.path" loading="lazy" />
      <div v-else class="placeholder" :style="mediaStyle" />
      <div v-if="tile.isVid" class="duration-badge">{{ durationText }}</div>
      <div class="title-overlay">{{ title }}</div>
    </template>
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

.placeholder {
  background: #555;
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
