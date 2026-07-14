import { reactive, computed, watch } from 'vue'
import type { Preset } from '../types'
import { savePresets as apiSavePresets } from '../api/presets'
import { makeDefaultPreset } from '../defaultPreset'

// Session-storage key for the "Temp Preset": local edits made in the
// settings modal that apply immediately but haven't been saved to the
// server yet. Surviving a page refresh means an accidental reload doesn't
// discard in-progress edits.
const TEMP_STORAGE_KEY = 'mediagrid_temp_presets'

interface State {
  serverPresets: Preset[]
  activePresets: Preset[]
  selectedName: string
  loaded: boolean
}

const state = reactive<State>({
  serverPresets: [],
  activePresets: [],
  selectedName: '',
  loaded: false,
})

function clonePresets(presets: Preset[]): Preset[] {
  return presets.map((p) => ({ ...p }))
}

function persistTemp() {
  sessionStorage.setItem(TEMP_STORAGE_KEY, JSON.stringify(state.activePresets))
}

function clearTemp() {
  sessionStorage.removeItem(TEMP_STORAGE_KEY)
}

function pickInitialSelectedName(presets: Preset[]): string {
  const urlName = new URLSearchParams(window.location.search).get('p')
  if (urlName && presets.some((p) => p.name === urlName)) return urlName
  return 'default'
}

// Populates the store from a preset list already fetched by the caller
// (GET /api/settings is only ever called once, at startup — see urlStore.init()).
function load(server: Preset[]) {
  state.serverPresets = server

  const raw = sessionStorage.getItem(TEMP_STORAGE_KEY)
  if (raw) {
    try {
      state.activePresets = JSON.parse(raw)
    } catch {
      state.activePresets = clonePresets(server)
    }
  } else {
    state.activePresets = clonePresets(server)
  }

  state.selectedName = pickInitialSelectedName(state.activePresets)
  state.loaded = true
}

const selectedPreset = computed<Preset | undefined>(() =>
  state.activePresets.find((p) => p.name === state.selectedName),
)

const isDirty = computed(() => JSON.stringify(state.activePresets) !== JSON.stringify(state.serverPresets))

// Any edit made in the settings modal (field tweak, rename, dupe, delete,
// new preset) mutates state.activePresets directly; this persists it to
// session storage as the "Temp Preset" so a refresh doesn't lose it.
watch(
  () => state.activePresets,
  () => {
    if (state.loaded) persistTemp()
  },
  { deep: true },
)

// URL sync for the selected preset (the `p` param) is handled reactively by
// urlStore, which watches state.selectedName — this just updates state.
function selectPreset(name: string) {
  state.selectedName = name
}

// Called by the settings modal on every edit. Applies immediately to local
// state (and session storage) but does not touch the server.
function setActivePresets(presets: Preset[]) {
  state.activePresets = presets
  persistTemp()
}

function revert() {
  state.activePresets = clonePresets(state.serverPresets)
  clearTemp()
  if (!state.activePresets.some((p) => p.name === state.selectedName)) {
    state.selectedName = state.activePresets.some((p) => p.name === 'default')
      ? 'default'
      : (state.activePresets[0]?.name ?? 'default')
  }
}

async function savePermanently() {
  await apiSavePresets(state.activePresets)
  state.serverPresets = clonePresets(state.activePresets)
  clearTemp()
}

function nameExists(name: string): boolean {
  return state.activePresets.some((p) => p.name === name)
}

// "New Preset" if unused, otherwise "New Preset 2", "New Preset 3", etc.
function suggestNewPresetName(): string {
  if (!nameExists('New Preset')) return 'New Preset'
  let n = 2
  while (nameExists(`New Preset ${n}`)) n++
  return `New Preset ${n}`
}

// Returns false (and leaves state untouched) if name is already taken —
// callers are expected to alert() the user themselves.
function addPreset(name: string): boolean {
  if (nameExists(name)) return false
  state.activePresets.push(makeDefaultPreset(name))
  selectPreset(name)
  return true
}

function renamePreset(oldName: string, newName: string): boolean {
  if (oldName === newName) return true
  if (nameExists(newName)) return false
  const preset = state.activePresets.find((p) => p.name === oldName)
  if (!preset) return false
  preset.name = newName
  if (state.selectedName === oldName) selectPreset(newName)
  return true
}

function deletePreset(name: string) {
  const idx = state.activePresets.findIndex((p) => p.name === name)
  if (idx === -1) return
  state.activePresets.splice(idx, 1)
  if (state.selectedName === name) {
    const fallback = state.activePresets.some((p) => p.name === 'default')
      ? 'default'
      : (state.activePresets[0]?.name ?? 'default')
    selectPreset(fallback)
  }
}

export const presetsStore = {
  state,
  selectedPreset,
  isDirty,
  load,
  selectPreset,
  setActivePresets,
  revert,
  savePermanently,
  nameExists,
  suggestNewPresetName,
  addPreset,
  renamePreset,
  deletePreset,
}
