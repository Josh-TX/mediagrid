import { reactive, computed, watch } from 'vue'
import type { GeneralSettings } from '../types'
import { saveGeneralSettings as apiSaveGeneralSettings } from '../api/settings'
import { makeDefaultGeneralSettings } from '../defaultGeneralSettings'

// Session-storage key for in-progress General tab edits: applied
// immediately but not yet saved to the server, mirroring presetsStore's
// "Temp Preset" so an accidental page refresh doesn't discard them.
const TEMP_STORAGE_KEY = 'mediagrid_temp_general'

interface State {
  serverGeneral: GeneralSettings
  activeGeneral: GeneralSettings
  loaded: boolean
}

const state = reactive<State>({
  serverGeneral: makeDefaultGeneralSettings(),
  activeGeneral: makeDefaultGeneralSettings(),
  loaded: false,
})

function persistTemp() {
  sessionStorage.setItem(TEMP_STORAGE_KEY, JSON.stringify(state.activeGeneral))
}

function clearTemp() {
  sessionStorage.removeItem(TEMP_STORAGE_KEY)
}

// Populates the store from general settings already fetched by the caller
// (GET /api/settings is only ever called once, at startup — see urlStore.init()).
function load(server: GeneralSettings) {
  state.serverGeneral = server

  const raw = sessionStorage.getItem(TEMP_STORAGE_KEY)
  if (raw) {
    try {
      state.activeGeneral = JSON.parse(raw)
    } catch {
      state.activeGeneral = { ...server }
    }
  } else {
    state.activeGeneral = { ...server }
  }

  state.loaded = true
}

const isDirty = computed(() => JSON.stringify(state.activeGeneral) !== JSON.stringify(state.serverGeneral))

// Any edit made in the General tab mutates state.activeGeneral directly;
// this persists it to session storage as the in-progress copy.
watch(
  () => state.activeGeneral,
  () => {
    if (state.loaded) persistTemp()
  },
  { deep: true },
)

function revert() {
  state.activeGeneral = { ...state.serverGeneral }
  clearTemp()
}

async function savePermanently() {
  await apiSaveGeneralSettings(state.activeGeneral)
  state.serverGeneral = { ...state.activeGeneral }
  clearTemp()
}

export const generalSettingsStore = {
  state,
  isDirty,
  load,
  revert,
  savePermanently,
}
