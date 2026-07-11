<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Tile, AutoPlayTile } from '../types'
import { mediaUrl } from '../api/shuffle'
import { playerStore } from '../stores/playerStore'
import { urlStore } from '../stores/urlStore'

const props = defineProps<{
  tile: Tile
  rowH: number
  cropX: number
  cropY: number
  autoPlayTile: AutoPlayTile
}>()

const videoEl = ref<HTMLVideoElement | null>(null)

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

function onClick() {
  urlStore.openTile(props.tile.tilei)
}

function play() {
  if (props.autoPlayTile === 'hover') videoEl.value?.play().catch(() => {})
}

function pauseReset() {
  if (props.autoPlayTile === 'hover' && videoEl.value) {
    videoEl.value.pause()
    videoEl.value.currentTime = 0
  }
}
</script>

<template>
  <div
    class="tile"
    :style="{ width: tile.w + 'px', height: rowH + 'px' }"
    @click="onClick"
    @mouseenter="play"
    @mouseleave="pauseReset"
    @touchstart.passive="play"
    @touchend.passive="pauseReset"
  >
    <template v-if="!playerStore.state.previewsHidden">
      <video
        v-if="tile.isVid"
        ref="videoEl"
        :src="mediaUrl(tile.preview.path)"
        :style="mediaStyle"
        muted
        playsinline
        loop
        preload="metadata"
        :autoplay="autoPlayTile === 'always'"
      />
      <img v-else :src="mediaUrl(tile.preview.path)" :style="mediaStyle" :alt="tile.path" loading="lazy" />
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
.tile video {
  position: absolute;
  object-fit: fill;
}
</style>
