import { reactive } from 'vue'
import type { Row } from '../types'
import { fetchShuffle, type ShuffleQuery } from '../api/shuffle'

const ROWS_PER_PAGE = 20

const state = reactive({
  rows: [] as Row[],
  totalRows: 0,
  totalTiles: 0,
  loading: false,
  error: false,
  loadingMore: false,
})

// The params from the most recent reset(), reused (with a shifted skipr) by
// loadMore()/ensureRowsForTile() to keep paging through the same
// filtered/sorted list.
let currentParams: ShuffleQuery | null = null

async function resetInternal(params: ShuffleQuery, takei?: number) {
  currentParams = params
  state.loading = true
  state.error = false
  state.rows = []
  state.totalRows = 0
  state.totalTiles = 0
  try {
    const result = await fetchShuffle({ ...params, skipr: 0, taker: ROWS_PER_PAGE, takei })
    state.rows = result.rows
    state.totalRows = result.totalRows
    state.totalTiles = result.totalTiles
  } catch {
    state.error = true
  } finally {
    state.loading = false
  }
}

async function reset(params: ShuffleQuery) {
  await resetInternal(params)
}

// Direct-load variant: a single fetch that both resets the Gallery's rows
// and loads far enough to cover `takei` (the Player's target tile), so the
// Player never needs a second, separate fetch to open at that index.
async function resetWithTakei(params: ShuffleQuery, takei: number) {
  await resetInternal(params, takei)
}

async function loadMore() {
  if (state.loading || state.loadingMore) return
  if (!currentParams || state.rows.length >= state.totalRows) return

  const skipr = state.rows.length
  state.loadingMore = true
  try {
    const result = await fetchShuffle({ ...currentParams, skipr, taker: ROWS_PER_PAGE, reshuffle: false })
    state.rows.push(...result.rows)
  } finally {
    state.loadingMore = false
  }
}

// Appends rows (if needed) so that tilei falls within state.rows — used when
// a URL/popstate-driven Player index lands beyond what's currently loaded.
// No-ops if tilei is already covered (or out of range client-side can't yet
// tell — that's checked by the caller against the resulting totalTiles).
async function ensureRowsForTile(tilei: number) {
  if (!currentParams || tilei < 0) return
  const loadedTiles = state.rows.reduce((sum, row) => sum + row.tiles.length, 0)
  if (tilei < loadedTiles || state.rows.length >= state.totalRows) return

  const skipr = state.rows.length
  const result = await fetchShuffle({ ...currentParams, skipr, taker: ROWS_PER_PAGE, takei: tilei, reshuffle: false })
  state.rows.push(...result.rows)
  state.totalRows = result.totalRows
  state.totalTiles = result.totalTiles
}

function retry() {
  if (currentParams) reset(currentParams)
}

// Locally patches a single tile's path after a successful rename (the path
// is known to be unique per shufflelist, so tilei alone identifies it) —
// avoids a full reshuffle/refetch just to reflect the rename.
function renameTile(tilei: number, newPath: string) {
  for (const row of state.rows) {
    const tile = row.tiles.find((t) => t.tilei === tilei)
    if (tile) {
      tile.path = newPath
      return
    }
  }
}

export const galleryStore = { state, reset, resetWithTakei, loadMore, ensureRowsForTile, retry, renameTile }
