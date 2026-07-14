<script setup lang="ts">
import type { Row } from '../types'
import Tile from './Tile.vue'

defineProps<{
  row: Row
  cropX: number
  cropY: number
  tilePreviewAlways: boolean
  fallbackToOriginal: boolean
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
      :tile-preview-always="tilePreviewAlways"
      :fallback-to-original="fallbackToOriginal"
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
