import { ref } from 'vue'

// Tracks which single Tile is currently "interacted with" (hovered/touched),
// so that "On Interaction" video playback never has more than one tile
// playing at once — starting interaction on a tile steals it away from
// whichever tile previously held it.
const activeTilei = ref<number | null>(null)

function start(tilei: number) {
  activeTilei.value = tilei
}

function end(tilei: number) {
  if (activeTilei.value === tilei) {
    activeTilei.value = null
  }
}

function clear() {
  activeTilei.value = null
}

// Touch leaves a tile active after the finger lifts; focusing any input dismisses it.
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement | null
    if (t?.matches?.('input, textarea, select')) clear()
  })
}

function isActive(tilei: number): boolean {
  return activeTilei.value === tilei
}

export const tileInteractionStore = {
  start,
  end,
  clear,
  isActive,
}
