import { reactive } from 'vue'

// Staggers highlight-video network loading across gallery rows: a row's
// videos are only allowed to start fetching once at most CONCURRENT_ROWS - 1
// rows above it (by rowi) still have a pending video load. This stops rows
// sitting in the render buffer, but not yet visible, from competing for
// bandwidth with the rows the user is actually looking at, while still
// letting a couple of rows load in parallel (and interleave — as soon as
// the topmost pending row finishes, the next one in line is allowed to
// start, regardless of what else is still loading).
const CONCURRENT_ROWS = 2

const pendingCounts = reactive<Record<number, number>>({})

function markPending(rowi: number) {
  pendingCounts[rowi] = (pendingCounts[rowi] ?? 0) + 1
}

function markSettled(rowi: number) {
  const next = (pendingCounts[rowi] ?? 0) - 1
  if (next <= 0) {
    delete pendingCounts[rowi]
  } else {
    pendingCounts[rowi] = next
  }
}

function isRowUnlocked(rowi: number): boolean {
  let rowsAheadPending = 0
  for (const key of Object.keys(pendingCounts)) {
    if (Number(key) < rowi && pendingCounts[Number(key)] > 0) {
      rowsAheadPending++
      if (rowsAheadPending >= CONCURRENT_ROWS) return false
    }
  }
  return true
}

export const videoLoadQueue = {
  markPending,
  markSettled,
  isRowUnlocked,
}
