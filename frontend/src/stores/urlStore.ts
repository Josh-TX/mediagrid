import { reactive, watch, nextTick } from 'vue'
import { presetsStore } from './presetsStore'
import { generalSettingsStore } from './generalSettingsStore'
import { uiStore, defaultDirFor } from './uiStore'
import { galleryStore } from './galleryStore'
import { playerStore } from './playerStore'
import { toastStore } from './toastStore'
import { buildShuffleQuery } from '../buildShuffleQuery'
import { fetchSettings } from '../api/settings'
import type { ShuffleQuery } from '../api/shuffle'
import type { SortType, SortDir } from '../types'

interface UrlParams {
  p?: string
  sort?: SortType
  sortDir?: SortDir
  f?: string
  i?: number
}

const state = reactive({
  // Starts false on every fresh page load; becomes true the moment the app
  // performs its first pushState this session, and then stays true for the
  // rest of the page's lifetime. Governs how closing the Player behaves
  // (native history.back() vs manually stripping `i`) — see closePlayer().
  useNativeBack: false,
})

// Set while urlStore itself is applying a URL (initial load or popstate) to
// the stores, so the settings watcher below doesn't mistake that for a new
// user-initiated change and push a redundant/incorrect history entry.
let suppressSettingsWatch = false

// Guards against out-of-order popstate-driven fetches (e.g. back-button
// spam) clobbering state with a stale response — only the response from the
// most recently started resolution is applied.
let requestGeneration = 0

let listenersInitialized = false

function markPush() {
  state.useNativeBack = true
}

function patchedUrl(patch: Record<string, string | undefined>): URL {
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  return url
}

function pushUrl(patch: Record<string, string | undefined>) {
  window.history.pushState({}, '', patchedUrl(patch))
  markPush()
}

function replaceUrl(patch: Record<string, string | undefined>) {
  window.history.replaceState({}, '', patchedUrl(patch))
}

function parseUrlParams(): UrlParams {
  const sp = new URLSearchParams(window.location.search)
  const result: UrlParams = {}
  const p = sp.get('p')
  if (p) result.p = p
  const sort = sp.get('sort')
  if (sort) result.sort = sort as SortType
  const sortDir = sp.get('sortDir')
  if (sortDir) result.sortDir = sortDir as SortDir
  const f = sp.get('f')
  if (f) result.f = f
  const iRaw = sp.get('i')
  if (iRaw !== null && iRaw !== '') {
    const n = Number(iRaw)
    if (Number.isInteger(n)) result.i = n
  }
  return result
}

function buildQuery(): ShuffleQuery | null {
  const preset = presetsStore.selectedPreset.value
  if (!preset) return null
  return buildShuffleQuery(
    preset,
    generalSettingsStore.state.activeGeneral.tilePct,
    uiStore.state.sortType,
    uiStore.state.sortDir,
    uiStore.state.filterText,
    window.innerWidth,
    window.innerHeight,
  )
}

async function refetchGallery() {
  const query = buildQuery()
  if (!query) return
  await galleryStore.reset(query)
}

async function reshuffle() {
  const query = buildQuery()
  if (!query) return
  await galleryStore.reset({ ...query, reshuffle: true })
}

// --- p/sort/sortDir/f <-> URL sync ---
//
// Only present in the URL when they differ from their implicit default, per
// spec. A single watcher (rather than wrapping every call site that can
// change these) naturally batches multiple synchronous field changes from
// one user action into one pushState, since Vue's watcher scheduler
// coalesces synchronous mutations into a single callback invocation.
function computeSettingsPatch(): Record<string, string | undefined> {
  const globalDefaultSort = generalSettingsStore.state.activeGeneral.defaultSort
  const sortType = uiStore.state.sortType
  return {
    p: presetsStore.state.selectedName !== 'default' ? presetsStore.state.selectedName : undefined,
    sort: sortType !== globalDefaultSort ? sortType : undefined,
    sortDir: uiStore.state.sortDir !== defaultDirFor(sortType) ? uiStore.state.sortDir : undefined,
    f: uiStore.state.filterText || undefined,
  }
}

function startWatchingSettings() {
  watch(
    () => [presetsStore.state.selectedName, uiStore.state.sortType, uiStore.state.sortDir, uiStore.state.filterText],
    () => {
      if (suppressSettingsWatch) return
      pushUrl(computeSettingsPatch())
    },
  )
}

// Applies p/sort/sortDir/f from a parsed URL to presetsStore/uiStore,
// falling back to defaults for anything absent/unrecognized. Used by both
// the initial load and popstate. Suppresses the settings watcher for the
// duration so this doesn't get mistaken for a user-initiated change.
async function applySettingsParams(params: UrlParams): Promise<boolean> {
  suppressSettingsWatch = true
  let changed = false
  try {
    const validPresetName =
      params.p && presetsStore.state.activePresets.some((preset) => preset.name === params.p) ? params.p : 'default'
    if (presetsStore.state.selectedName !== validPresetName) {
      presetsStore.selectPreset(validPresetName)
      changed = true
    }
    const targetSort = params.sort ?? generalSettingsStore.state.activeGeneral.defaultSort
    const targetDir = params.sortDir ?? defaultDirFor(targetSort)
    const targetFilter = params.f ?? ''
    if (uiStore.state.sortType !== targetSort || uiStore.state.sortDir !== targetDir) {
      uiStore.setSortType(targetSort)
      uiStore.state.sortDir = targetDir
      changed = true
    }
    if (uiStore.state.filterText !== targetFilter) {
      uiStore.setFilterText(targetFilter)
      changed = true
    }
  } finally {
    await nextTick()
    suppressSettingsWatch = false
  }
  return changed
}

// --- Player `i` <-> URL ---

// Tapping a Tile to open the Player: pushState (a new, navigable moment).
function openTile(tilei: number) {
  playerStore.open(tilei)
  pushUrl({ i: String(tilei) })
}

// Hud back button / Escape key.
function closePlayer() {
  if (state.useNativeBack) {
    // Whatever pushed the current entry left a valid prior in-app entry
    // behind it — popstate's handler will notice `i` disappeared and close
    // the Player then.
    window.history.back()
    return
  }
  // Only reachable right after a direct load/refresh with `i` already in the
  // URL. Manually strip `i` via pushState (not replace) so the original
  // direct-load URL survives as a history entry — a subsequent native back
  // from here returns to it and reopens the Player.
  playerStore.close()
  pushUrl({ i: undefined })
}

// Called after the Player swaps to a different Media (swipe, wheel,
// keyboard, or autoplayInitiallyOn-triggered advance) — always replaceState, never pushState.
function onSwap() {
  replaceUrl({ i: String(playerStore.state.currentIndex) })
}

// Resolves a popstate-driven `i` (possibly requiring more rows to be
// fetched) and applies it to playerStore, guarding against stale responses
// from overlapping back-button-spam requests.
async function syncPlayerIndex(targetIndex: number | null) {
  const gen = ++requestGeneration

  if (targetIndex === null) {
    if (playerStore.state.open) playerStore.close()
    return
  }

  if (targetIndex >= 0) {
    await galleryStore.ensureRowsForTile(targetIndex)
  }
  if (gen !== requestGeneration) return // a newer popstate has since superseded this one

  if (targetIndex < 0 || targetIndex >= galleryStore.state.totalTiles) {
    if (playerStore.state.open) playerStore.close()
    toastStore.show('invalid media index')
    replaceUrl({ i: undefined })
    return
  }

  if (playerStore.state.open) {
    playerStore.setIndex(targetIndex) // instant jump — popstate isn't a swipe gesture
  } else {
    playerStore.open(targetIndex)
  }
}

async function onPopState() {
  const params = parseUrlParams()
  const settingsChanged = await applySettingsParams(params)
  if (settingsChanged) await refetchGallery()
  await syncPlayerIndex(params.i ?? null)
}

// Direct load: the page loaded with `i` already in the URL. Opens the
// Player immediately (previewsHidden from the very first render, no slide
// transition since state.open is already true on Player's first render)
// and resolves it against a single combined /api/shuffle fetch.
async function initDirectLoad(targetIndex: number) {
  if (targetIndex < 0) {
    toastStore.show('invalid media index')
    replaceUrl({ i: undefined })
    refetchGallery()
    return
  }

  playerStore.openDirect(targetIndex)
  const query = buildQuery()
  if (!query) {
    playerStore.close()
    return
  }
  await galleryStore.resetWithTakei(query, targetIndex + 3)

  if (targetIndex >= galleryStore.state.totalTiles) {
    playerStore.close()
    toastStore.show('invalid media index')
    replaceUrl({ i: undefined })
  }
}

async function init() {
  // GET /api/settings is only ever called once, here — its result seeds both
  // presetsStore and generalSettingsStore.
  const settings = await fetchSettings()
  presetsStore.load(settings.presets)
  generalSettingsStore.load(settings.general)
  uiStore.setSortFromDefault(settings.general.defaultSort)

  const params = parseUrlParams()
  // presetsStore.load() already resolved `p` (via pickInitialSelectedName);
  // this layers sort/sortDir/f from the URL on top, same as popstate does.
  await applySettingsParams(params)

  // The popstate listener and settings watcher are one-time, page-lifetime
  // registrations — guarded so a second init() call (only realistically
  // happens in tests, which re-run init() per case against the same
  // singleton stores) doesn't stack up duplicate listeners/watchers.
  if (!listenersInitialized) {
    window.addEventListener('popstate', onPopState)
    startWatchingSettings()
    listenersInitialized = true
  }

  if (params.i !== undefined) {
    initDirectLoad(params.i) // not awaited — fires the shared fetch in the background
  } else {
    refetchGallery() // not awaited, so callers can flip `ready` immediately
  }
}

export const urlStore = {
  state,
  init,
  openTile,
  closePlayer,
  onSwap,
  refetchGallery,
  reshuffle,
}
