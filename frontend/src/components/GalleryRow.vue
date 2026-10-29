<script setup lang="ts">
import type { Row, TitleMode, VideoTier } from '../types'
import Tile from './Tile.vue'

defineProps<{
  row: Row
  cropX: number
  cropY: number
  videoTileInitial: VideoTier
  videoTileInteract: VideoTier
  spriteFps: number
  titleMode: TitleMode
  titleExt: boolean
}>()
</script>

<template>
  <div class="gallery-row" :style="{ height: row.h + 'px' }">
    <Tile
      v-for="tile in row.tiles"
      :key="tile.tilei"
      :tile="tile"
      :rowi="row.rowi"
      :row-h="row.h"
      :crop-x="cropX"
      :crop-y="cropY"
      :video-tile-initial="videoTileInitial"
      :video-tile-interact="videoTileInteract"
      :sprite-fps="spriteFps"
      :title-mode="titleMode"
      :title-ext="titleExt"
    />
  </div>
</template>

<style scoped>
.gallery-row {
  display: flex;
  gap: 1px;
  width: 100%;
}
</style>
