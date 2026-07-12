import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { urlStore } from './urlStore'
import { presetsStore } from './presetsStore'
import { uiStore } from './uiStore'
import { galleryStore } from './galleryStore'
import { playerStore } from './playerStore'
import { toastStore } from './toastStore'
import { makeDefaultPreset } from '../defaultPreset'
import type { Row, Tile } from '../types'

const TILES_PER_ROW = 5
const TOTAL_ROWS = 20
const TOTAL_TILES = TILES_PER_ROW * TOTAL_ROWS

function makeTile(tilei: number): Tile {
  return {
    tilei,
    w: 100,
    path: `media/${tilei}.jpg`,
    isVid: false,
    duration: 0,
    filesize: 1000,
    mdate: 0,
    preview: { w: 100, h: 100, hasThumbnail: false, hasHighlight: false },
  }
}

function makeRow(rowi: number): Row {
  const start = rowi * TILES_PER_ROW
  const tiles: Tile[] = []
  for (let i = 0; i < TILES_PER_ROW; i++) tiles.push(makeTile(start + i))
  return { rowi, h: 100, tiles }
}

function makeRows(count: number, startAt = 0): Row[] {
  return Array.from({ length: count }, (_, i) => makeRow(startAt + i))
}

// A tiny in-memory stand-in for the real backend's skipr/taker/takei
// row-range resolution (mirroring resolveRowRange's contract), so urlStore's
// fetch-driven logic can be exercised against realistic responses.
function fakeShuffleResponse(url: URL) {
  const sp = url.searchParams
  const skipr = Number(sp.get('skipr') ?? '0')
  const taker = sp.get('taker') !== null ? Number(sp.get('taker')) : TOTAL_ROWS
  let hi = Math.min(TOTAL_ROWS, skipr + taker)
  const takeiRaw = sp.get('takei')
  if (takeiRaw !== null) {
    const takei = Number(takeiRaw)
    const rowContaining = Math.min(Math.floor(Math.max(takei, 0) / TILES_PER_ROW), TOTAL_ROWS - 1)
    hi = Math.max(hi, Math.min(TOTAL_ROWS, rowContaining + 1))
  }
  const lo = Math.min(skipr, TOTAL_ROWS)
  return { totalRows: TOTAL_ROWS, totalTiles: TOTAL_TILES, rows: lo < hi ? makeRows(hi - lo, lo) : [] }
}

let fetchDelayMs = 0

function installFetchMock() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input), 'http://localhost/')
      if (fetchDelayMs > 0) await new Promise((r) => setTimeout(r, fetchDelayMs))
      if (url.pathname === '/api/presets') {
        return {
          ok: true,
          json: async () => [makeDefaultPreset('default'), { ...makeDefaultPreset('travel'), defaultSort: 'date' }],
        }
      }
      if (url.pathname === '/api/shuffle') {
        return { ok: true, json: async () => fakeShuffleResponse(url) }
      }
      throw new Error(`unexpected fetch: ${url.pathname}`)
    }),
  )
}

function setUrl(search: string) {
  window.history.replaceState({}, '', search ? `/?${search}` : '/')
}

// All the stores urlStore coordinates are module-level singletons; reset
// them (and the URL/session storage) to a known baseline before each test.
beforeEach(() => {
  fetchDelayMs = 0
  installFetchMock()
  sessionStorage.clear()
  setUrl('')

  presetsStore.state.activePresets = [makeDefaultPreset('default'), { ...makeDefaultPreset('travel'), defaultSort: 'date' }]
  presetsStore.state.serverPresets = presetsStore.state.activePresets.map((p) => ({ ...p }))
  presetsStore.state.selectedName = 'default'
  presetsStore.state.loaded = true

  uiStore.state.sortType = 'rand'
  uiStore.state.sortDir = 'asc'
  uiStore.state.filterText = ''

  galleryStore.state.rows = makeRows(4)
  galleryStore.state.totalRows = TOTAL_ROWS
  galleryStore.state.totalTiles = TOTAL_TILES
  galleryStore.state.loading = false
  galleryStore.state.error = false

  playerStore.state.open = false
  playerStore.state.currentIndex = 0
  playerStore.state.previewsHidden = false

  urlStore.state.useNativeBack = false
  toastStore.dismiss()

  vi.restoreAllMocks()
  installFetchMock() // restoreAllMocks above clears the stub; reinstall it
})

describe('urlStore: tile open / close / swap', () => {
  it('openTile opens the Player, pushes `i`, and flips useNativeBack to true', () => {
    expect(urlStore.state.useNativeBack).toBe(false)
    urlStore.openTile(7)
    expect(playerStore.state.open).toBe(true)
    expect(playerStore.state.currentIndex).toBe(7)
    expect(new URLSearchParams(window.location.search).get('i')).toBe('7')
    expect(urlStore.state.useNativeBack).toBe(true)
  })

  it('closePlayer strips `i` via pushState (not history.back) when useNativeBack is false', () => {
    setUrl('i=3')
    playerStore.state.open = true
    playerStore.state.currentIndex = 3
    const backSpy = vi.spyOn(window.history, 'back')

    urlStore.closePlayer()

    expect(backSpy).not.toHaveBeenCalled()
    expect(playerStore.state.open).toBe(false)
    expect(window.location.search).not.toContain('i=')
    // Manually stripping `i` is itself a pushState, so future closes flip to native back.
    expect(urlStore.state.useNativeBack).toBe(true)
  })

  it('closePlayer defers to native history.back() once useNativeBack is true', () => {
    urlStore.state.useNativeBack = true
    playerStore.state.open = true
    playerStore.state.currentIndex = 3
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    urlStore.closePlayer()

    expect(backSpy).toHaveBeenCalledTimes(1)
  })

  it('onSwap replaceState-s the new index without flipping useNativeBack', () => {
    playerStore.state.open = true
    playerStore.state.currentIndex = 2
    const replaceSpy = vi.spyOn(window.history, 'replaceState')

    urlStore.onSwap()

    expect(replaceSpy).toHaveBeenCalled()
    expect(new URLSearchParams(window.location.search).get('i')).toBe('2')
    expect(urlStore.state.useNativeBack).toBe(false)
  })
})

describe('urlStore: settings <-> URL sync', () => {
  it('omits p/sort/sortDir/f when they match their implicit defaults', async () => {
    await urlStore.init()
    presetsStore.selectPreset('default')
    await nextTick()
    expect(window.location.search).toBe('')
  })

  it('batches a preset switch (which also resets sort/sortDir) into a single pushState', async () => {
    await urlStore.init()
    const pushSpy = vi.spyOn(window.history, 'pushState')

    // Mirrors Toolbar's onPresetChange: both mutations happen synchronously.
    presetsStore.selectPreset('travel')
    uiStore.setSortFromPreset(presetsStore.selectedPreset.value!.defaultSort)
    await nextTick()

    expect(pushSpy).toHaveBeenCalledTimes(1)
    const params = new URLSearchParams(window.location.search)
    expect(params.get('p')).toBe('travel')
    // sort/sortDir now match travel's own default ('date'/'desc'), so they're omitted.
    expect(params.has('sort')).toBe(false)
    expect(params.has('sortDir')).toBe(false)
  })

  it('includes sort/sortDir only when they diverge from the preset default', async () => {
    await urlStore.init()
    uiStore.setSortType('size')
    uiStore.toggleDir() // size defaults to desc; toggling makes it asc, so now non-default
    await nextTick()

    const params = new URLSearchParams(window.location.search)
    expect(params.get('sort')).toBe('size')
    expect(params.get('sortDir')).toBe('asc')
  })

  it('includes f whenever the filter text is non-empty', async () => {
    await urlStore.init()
    uiStore.setFilterText('beach')
    await nextTick()
    expect(new URLSearchParams(window.location.search).get('f')).toBe('beach')
  })
})

describe('urlStore: responding to popstate', () => {
  it('resyncs presetsStore/uiStore and refetches the Gallery when settings params change', async () => {
    await urlStore.init()
    setUrl('p=travel&sort=az')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vi.waitFor(() => expect(presetsStore.state.selectedName).toBe('travel'))

    expect(uiStore.state.sortType).toBe('az')
    expect(uiStore.state.sortDir).toBe('asc') // az's natural default, since sortDir wasn't in the URL
    await vi.waitFor(() => expect(galleryStore.state.totalTiles).toBe(TOTAL_TILES))
  })

  it('falls back to "default" for an unrecognized preset name', async () => {
    await urlStore.init()
    setUrl('p=nonexistent')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vi.waitFor(() => expect(presetsStore.state.selectedName).toBe('default'))
  })

  it('opens the Player at the target index, fetching more rows if the tile is beyond what is loaded', async () => {
    await urlStore.init()
    galleryStore.state.rows = makeRows(2) // only tiles 0-9 loaded
    setUrl('i=17') // row 3, not yet loaded
    window.dispatchEvent(new PopStateEvent('popstate'))

    await vi.waitFor(() => expect(playerStore.state.open).toBe(true))
    expect(playerStore.state.currentIndex).toBe(17)
    expect(galleryStore.state.rows.length).toBeGreaterThan(2)
  })

  it('closes the Player when `i` disappears from the URL', async () => {
    await urlStore.init()
    playerStore.state.open = true
    playerStore.state.currentIndex = 5
    setUrl('')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vi.waitFor(() => expect(playerStore.state.open).toBe(false))
  })

  it('jumps an already-open Player straight to a non-adjacent index with no swap animation', async () => {
    await urlStore.init()
    playerStore.state.open = true
    playerStore.state.currentIndex = 2
    setUrl('i=15')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vi.waitFor(() => expect(playerStore.state.currentIndex).toBe(15))
    expect(playerStore.state.open).toBe(true)
  })

  it('treats an out-of-range index as invalid: closes the Player, toasts, and strips `i`', async () => {
    await urlStore.init()
    playerStore.state.open = true
    playerStore.state.currentIndex = 5
    setUrl(`i=${TOTAL_TILES + 50}`)
    window.dispatchEvent(new PopStateEvent('popstate'))

    await vi.waitFor(() => expect(playerStore.state.open).toBe(false))
    expect(toastStore.state.message).toBe('invalid media index')
    expect(window.location.search).not.toContain('i=')
  })

  it('discards a stale response when popstate fires again before the first resolves', async () => {
    await urlStore.init()
    galleryStore.state.rows = makeRows(1) // only tiles 0-4 loaded; both targets need a fetch
    fetchDelayMs = 20

    setUrl('i=10')
    window.dispatchEvent(new PopStateEvent('popstate')) // slow, in flight
    setUrl('i=16')
    window.dispatchEvent(new PopStateEvent('popstate')) // second, overtakes the first

    await vi.waitFor(() => expect(playerStore.state.currentIndex).toBe(16))
    // Give the first (stale) request a chance to resolve too, and confirm it didn't clobber the second.
    await new Promise((r) => setTimeout(r, 30))
    expect(playerStore.state.currentIndex).toBe(16)
  })
})

describe('urlStore: direct load with `i` in the URL', () => {
  it('opens the Player immediately with previewsHidden already true, via a single shuffle fetch', async () => {
    setUrl('i=8')
    const fetchSpy = vi.mocked(fetch)

    await urlStore.init()

    expect(playerStore.state.open).toBe(true)
    expect(playerStore.state.previewsHidden).toBe(true)
    expect(playerStore.state.currentIndex).toBe(8)

    await vi.waitFor(() => expect(galleryStore.state.totalTiles).toBe(TOTAL_TILES))
    const shuffleCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes('/api/shuffle'))
    expect(shuffleCalls).toHaveLength(1)
    const url = new URL(String(shuffleCalls[0][0]), 'http://localhost/')
    expect(url.searchParams.get('takei')).toBe('11') // i + 3
  })

  it('closes the Player and toasts when the direct-load index is out of range', async () => {
    setUrl(`i=${TOTAL_TILES + 5}`)
    await urlStore.init()
    await vi.waitFor(() => expect(playerStore.state.open).toBe(false))
    expect(toastStore.state.message).toBe('invalid media index')
    expect(window.location.search).not.toContain('i=')
  })

  it('treats a negative index as invalid without ever opening the Player', async () => {
    setUrl('i=-1')
    await urlStore.init()
    expect(playerStore.state.open).toBe(false)
    expect(toastStore.state.message).toBe('invalid media index')
  })
})
