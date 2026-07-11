import { reactive, computed } from 'vue'
import type { Tile } from '../types'
import { galleryStore } from './galleryStore'
import { PREFETCH_ROW_BUFFER } from '../playerConstants'

const state = reactive({
  open: false,
  currentIndex: 0,
})

// Flat, tilei-ordered view of every tile currently loaded into the Gallery.
// Since rows are always paginated in order starting at row 0, this list's
// array index lines up with each tile's global tilei.
const mediaList = computed<Tile[]>(() => galleryStore.state.rows.flatMap((row) => row.tiles))

const canGoPrev = computed(() => state.currentIndex > 0)
const canGoNext = computed(() => state.currentIndex < mediaList.value.length - 1)

// Which loaded-row index a flat media-list index falls in, so prefetching
// can be expressed in terms of "rows remaining" per the spec.
function rowIndexForTileIndex(index: number): number {
  let count = 0
  const rows = galleryStore.state.rows
  for (let i = 0; i < rows.length; i++) {
    count += rows[i].tiles.length
    if (index < count) return i
  }
  return rows.length - 1
}

// Proactively fetches more rows once the current position is within the
// last couple of loaded rows, so a swipe never outruns what's loaded.
function ensurePrefetch() {
  const rows = galleryStore.state.rows
  if (rows.length === 0) return
  const rowIndex = rowIndexForTileIndex(state.currentIndex)
  if (rows.length - rowIndex <= PREFETCH_ROW_BUFFER) {
    galleryStore.loadMore()
  }
}

function open(tilei: number) {
  const index = mediaList.value.findIndex((t) => t.tilei === tilei)
  state.currentIndex = index === -1 ? 0 : index
  state.open = true
  ensurePrefetch()
}

function close() {
  state.open = false
}

function goNext(): boolean {
  if (!canGoNext.value) return false
  state.currentIndex++
  ensurePrefetch()
  return true
}

function goPrev(): boolean {
  if (!canGoPrev.value) return false
  state.currentIndex--
  return true
}

export const playerStore = {
  state,
  mediaList,
  canGoPrev,
  canGoNext,
  open,
  close,
  goNext,
  goPrev,
}
