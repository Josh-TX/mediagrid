<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import GalleryRow from './GalleryRow.vue'
import { galleryStore } from '../stores/galleryStore'
import { generalSettingsStore } from '../stores/generalSettingsStore'
import { playerStore } from '../stores/playerStore'

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

// Px below the viewport top the direct-load target row should land at.
const DIRECT_LOAD_ROW_OFFSET = 100

// Reference point the per-swap delta below is computed against: the
// Gallery's scrollTop and row index at the moment the Player's current
// position last had its scroll position pinned down. Set once per Player
// session — see the two watchers below — and cleared when the Player closes.
const anchor = ref<{ scrollTop: number; rowIndex: number } | null>(null)

function applyScrollTop(value: number) {
  if (!container.value) return
  container.value.scrollTop = value
  scrollTop.value = value
}

// Fires once per Player open (openMode transitions null -> 'tap'/'direct').
// A tap-open anchors immediately, on wherever the Gallery already happens to
// be scrolled. A direct-load open can't anchor yet — the target row's data
// hasn't arrived — so it just clears the anchor and lets the rows-loaded
// watcher below establish it once ready.
watch(
  () => playerStore.state.openMode,
  (mode) => {
    if (mode === 'tap') {
      anchor.value = {
        scrollTop: scrollTop.value,
        rowIndex: playerStore.rowIndexForTileIndex(playerStore.state.currentIndex),
      }
    } else {
      anchor.value = null
    }
  },
)

// Scenario 2 (direct load): once enough rows have loaded to cover the
// direct-loaded tile, anchor so its row sits DIRECT_LOAD_ROW_OFFSET px below
// the viewport top. Guarded to run only once per open (anchor.value is
// still null) so later row loads (prefetch) don't re-trigger it.
watch(
  () => rows.value.length,
  async () => {
    if (playerStore.state.openMode !== 'direct' || anchor.value) return
    const tilesLoaded = rows.value.reduce((sum, row) => sum + row.tiles.length, 0)
    if (tilesLoaded <= playerStore.state.currentIndex) return
    const rowIndex = playerStore.rowIndexForTileIndex(playerStore.state.currentIndex)
    const target = Math.max(0, offsets.value[rowIndex] - DIRECT_LOAD_ROW_OFFSET)
    // Committing the anchor now (rather than after the loop below) blocks
    // this watcher's own loadMore() calls from re-entering this block.
    anchor.value = { scrollTop: target, rowIndex }
    // resetWithTakei only loads enough rows to cover the target tile itself,
    // not enough beyond it to fill a viewport's worth of space below —
    // without this, the browser can't scroll that far yet and silently
    // clamps scrollTop back down. Keep loading more until there's either
    // enough content or nothing left to load.
    while (totalHeight.value < target + viewportHeight.value && rows.value.length < galleryStore.state.totalRows) {
      await galleryStore.loadMore()
    }
    // Wait for the DOM to actually grow to fit the newly-loaded rows —
    // otherwise the container isn't tall enough yet in the real DOM even
    // though our own totalHeight computation already reflects it.
    await nextTick()
    applyScrollTop(target)
  },
  { immediate: true },
)

// Runs on every swap: re-derives scrollTop from the anchor rather than
// accumulating deltas, so it can't drift. A same-row swap (multiple tiles
// per row) naturally computes a zero delta.
watch(
  () => playerStore.state.currentIndex,
  () => {
    if (!anchor.value) return
    const rowIndex = playerStore.rowIndexForTileIndex(playerStore.state.currentIndex)
    const delta = offsets.value[rowIndex] - offsets.value[anchor.value.rowIndex]
    applyScrollTop(Math.max(0, anchor.value.scrollTop + delta))
  },
)

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
