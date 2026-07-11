import { reactive } from 'vue'
import type { SortType, SortDir } from '../types'

// The "natural" direction for a given sort type when none is specified
// explicitly — exported so urlStore can tell whether a URL's sortDir is
// redundant (matches the natural default and so should be omitted).
export function defaultDirFor(sortType: SortType): SortDir {
  return sortType === 'size' || sortType === 'date' ? 'desc' : 'asc'
}

const state = reactive({
  sortType: 'rand' as SortType,
  sortDir: 'asc' as SortDir,
  filterText: '',
})

// Called whenever the selected preset changes, so the toolbar reflects that
// preset's defaultSort — this does not persist back into the preset.
function setSortFromPreset(defaultSort: SortType) {
  state.sortType = defaultSort
  state.sortDir = defaultDirFor(defaultSort)
}

function setSortType(sortType: SortType) {
  state.sortType = sortType
  state.sortDir = defaultDirFor(sortType)
}

function toggleDir() {
  state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc'
}

function setFilterText(text: string) {
  state.filterText = text
}

export const uiStore = {
  state,
  setSortFromPreset,
  setSortType,
  toggleDir,
  setFilterText,
}
