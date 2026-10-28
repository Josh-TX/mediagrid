import { reactive } from 'vue'
import type { Tile } from '../types'

// Gallery multi-select. Active whenever at least one tile is selected;
// deselecting the last one exits. Selection is keyed by tilei, which is
// only meaningful for the current shufflelist, so it's cleared on any
// gallery reload.
const state = reactive({
  // A bulk operation is running: selection is frozen.
  busy: false,
  selected: {} as Record<number, Tile>,
  // Per-tile counters bumped after a bulk delete/move-out, so each Tile can
  // bust its preview cache (same role as Tile's local cacheBust).
  bust: {} as Record<number, number>,
})

function count(): number {
  return Object.keys(state.selected).length
}

function isActive(): boolean {
  return count() > 0
}

function isSelected(tilei: number): boolean {
  return tilei in state.selected
}

// Idempotent, so a native contextmenu and the manual long-press timer
// firing for the same press can't toggle the tile twice.
function enter(tile: Tile) {
  if (isActive()) return
  state.selected[tile.tilei] = tile
}

function toggle(tile: Tile) {
  if (state.busy) return
  if (isSelected(tile.tilei)) delete state.selected[tile.tilei]
  else state.selected[tile.tilei] = tile
}

function clear() {
  state.selected = {}
}

function tiles(): Tile[] {
  return Object.values(state.selected).sort((a, b) => a.tilei - b.tilei)
}

function bustTile(tilei: number) {
  state.bust[tilei] = (state.bust[tilei] ?? 0) + 1
}

export const selectionStore = { state, count, isActive, isSelected, enter, toggle, clear, tiles, bustTile }
