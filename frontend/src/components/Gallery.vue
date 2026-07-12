<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import GalleryRow from './GalleryRow.vue'
import { galleryStore } from '../stores/galleryStore'
import { generalSettingsStore } from '../stores/generalSettingsStore'

const ROW_GAP = 1
const LOAD_THRESHOLD = 1200
// Extra px of rows to keep mounted above/below the viewport, so scrolling
// doesn't visibly pop rows in/out.
const RENDER_BUFFER = 600

const container = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(0)

const rows = computed(() => galleryStore.state.rows)

// Prefix sum of each row's top offset (row heights + 1px gaps between rows,
// no gap before the first row), so height lookups don't require an
// estimate — rows load sequentially from the top.
const offsets = computed(() => {
  const result: number[] = []
  let y = 0
  for (let i = 0; i < rows.value.length; i++) {
    result.push(y)
    y += rows.value[i].h + ROW_GAP
  }
  return result
})

const totalHeight = computed(() => {
  if (rows.value.length === 0) return 0
  const last = rows.value.length - 1
  return offsets.value[last] + rows.value[last].h
})

const visibleRows = computed(() => {
  const top = scrollTop.value - RENDER_BUFFER
  const bottom = scrollTop.value + viewportHeight.value + RENDER_BUFFER
  const result: { row: (typeof rows.value)[number]; top: number }[] = []
  for (let i = 0; i < rows.value.length; i++) {
    const rowTop = offsets.value[i]
    const rowBottom = rowTop + rows.value[i].h
    if (rowBottom >= top && rowTop <= bottom) {
      result.push({ row: rows.value[i], top: rowTop })
    }
  }
  return result
})

function handleScroll() {
  if (!container.value) return
  scrollTop.value = container.value.scrollTop
  viewportHeight.value = container.value.clientHeight
  if (scrollTop.value + viewportHeight.value > totalHeight.value - LOAD_THRESHOLD) {
    galleryStore.loadMore()
  }
}

onMounted(() => {
  if (container.value) viewportHeight.value = container.value.clientHeight
  window.addEventListener('resize', handleScroll)
})
onBeforeUnmount(() => window.removeEventListener('resize', handleScroll))

defineExpose({ handleScroll })
</script>

<template>
  <div class="gallery" ref="container" @scroll="handleScroll">
    <div class="track" :style="{ height: totalHeight + 'px' }">
      <div
        v-for="item in visibleRows"
        :key="item.row.rowi"
        class="row-wrap"
        :style="{ top: item.top + 'px' }"
      >
        <GalleryRow
          :row="item.row"
          :crop-x="generalSettingsStore.state.activeGeneral.tileCropX"
          :crop-y="generalSettingsStore.state.activeGeneral.tileCropY"
          :auto-play-tile="generalSettingsStore.state.activeGeneral.autoPlayTile"
          :fallback-to-original="generalSettingsStore.state.activeGeneral.fallbackToOriginal"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: #fff;
}

.track {
  position: relative;
  width: 100%;
}

.row-wrap {
  position: absolute;
  left: 0;
  right: 0;
}
</style>
