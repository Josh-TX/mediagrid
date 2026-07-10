<script setup lang="ts">
import type { Row, AutoPlayTile } from '../types'
import Tile from './Tile.vue'

defineProps<{
  row: Row
  cropX: number
  cropY: number
  autoPlayTile: AutoPlayTile
}>()
</script>

<template>
  <div class="gallery-row" :style="{ height: row.h + 'px' }">
    <Tile
      v-for="tile in row.tiles"
      :key="tile.tilei"
      :tile="tile"
      :row-h="row.h"
      :crop-x="cropX"
      :crop-y="cropY"
      :auto-play-tile="autoPlayTile"
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
