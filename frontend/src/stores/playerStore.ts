import { reactive, computed } from 'vue'
import type { Tile } from '../types'
import { galleryStore } from './galleryStore'
import { PREFETCH_ROW_BUFFER } from '../playerConstants'

const state = reactive({
  open: false,
  currentIndex: 0,
  // Stays false until the open slide-in transition finishes, so Tile.vue
  // keeps rendering real previews underneath the Player while it's sliding
  // in (otherwise tiles would go blank before the Player covers them).
  previewsHidden: false,
  // How the Player was most recently opened — null while closed. Lets
  // Gallery's scroll-sync logic tell a tap-open (anchor on the tapped tile's
  // current on-screen position) apart from a direct load/refresh (anchor
  // computed so the target row lands near the viewport top).
  openMode: null as 'tap' | 'direct' | null,
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
  state.openMode = 'tap'
  ensurePrefetch()
}

// Direct-load open: used only when the page loads with `i` already in the
// URL. previewsHidden is set true immediately (rather than waiting for the
// open-transition to end, as onOpenTransitionEnd normally does) so Gallery
// tile previews are never mounted, even briefly, underneath the Player.
function openDirect(tilei: number) {
  state.currentIndex = tilei
  state.open = true
  state.previewsHidden = true
  state.openMode = 'direct'
}

// Instantly moves to an arbitrary index with no swap animation — used for
// popstate-driven index changes, which aren't swipe gestures.
function setIndex(tilei: number) {
  state.currentIndex = tilei
  ensurePrefetch()
}

// Fired once the Player's open slide-in transition finishes.
function onOpenTransitionEnd() {
  state.previewsHidden = true
}

function close() {
  state.open = false
  // Reveal previews immediately so they're already there as the Player
  // slides away, rather than popping in only once it's fully closed.
  state.previewsHidden = false
  state.openMode = null
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
  openDirect,
  setIndex,
  close,
  goNext,
  goPrev,
  onOpenTransitionEnd,
  rowIndexForTileIndex,
}
