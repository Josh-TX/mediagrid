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

// The params from the most recent reset(), reused (with a shifted minr/maxr)
// by loadMore() to keep paging through the same filtered/sorted list.
let currentParams: ShuffleQuery | null = null

async function reset(params: ShuffleQuery) {
  currentParams = params
  state.loading = true
  state.error = false
  state.rows = []
  state.totalRows = 0
  state.totalTiles = 0
  try {
    const result = await fetchShuffle({ ...params, minr: 0, maxr: ROWS_PER_PAGE })
    state.rows = result.rows
    state.totalRows = result.totalRows
    state.totalTiles = result.totalTiles
  } catch {
    state.error = true
  } finally {
    state.loading = false
  }
}

async function loadMore() {
  if (state.loading || state.loadingMore) return
  if (!currentParams || state.rows.length >= state.totalRows) return

  const minr = state.rows.length
  const maxr = Math.min(state.totalRows, minr + ROWS_PER_PAGE)

  state.loadingMore = true
  try {
    const result = await fetchShuffle({ ...currentParams, minr, maxr, reshuffle: false })
    state.rows.push(...result.rows)
  } finally {
    state.loadingMore = false
  }
}

function retry() {
  if (currentParams) reset(currentParams)
}

export const galleryStore = { state, reset, loadMore, retry }
