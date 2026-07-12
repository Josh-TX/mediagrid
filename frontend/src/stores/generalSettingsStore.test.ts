import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generalSettingsStore } from './generalSettingsStore'
import { makeDefaultGeneralSettings } from '../defaultGeneralSettings'

// generalSettingsStore is a module-level singleton, so each test resets it
// to a known baseline rather than relying on fresh module instances.
beforeEach(() => {
  sessionStorage.clear()
  generalSettingsStore.load(makeDefaultGeneralSettings())
})

describe('generalSettingsStore', () => {
  it('isDirty is false right after load, true after an edit, and false again after revert', () => {
    expect(generalSettingsStore.isDirty.value).toBe(false)

    generalSettingsStore.state.activeGeneral.tilePct = 0.42
    expect(generalSettingsStore.isDirty.value).toBe(true)

    generalSettingsStore.revert()
    expect(generalSettingsStore.isDirty.value).toBe(false)
    expect(generalSettingsStore.state.activeGeneral.tilePct).toBe(0.15)
  })

  it('persists edits to sessionStorage as they happen, and load() restores them (surviving a refresh)', async () => {
    generalSettingsStore.state.activeGeneral.rewindSeconds = 30
    // The persisting watcher is async (deep watch), so let it flush.
    await new Promise((r) => setTimeout(r, 0))
    expect(sessionStorage.getItem('mediagrid_temp_general')).toContain('"rewindSeconds":30')

    // Simulate a fresh page load: load() re-reads sessionStorage instead of
    // just cloning the server value.
    generalSettingsStore.load(makeDefaultGeneralSettings())
    expect(generalSettingsStore.state.activeGeneral.rewindSeconds).toBe(30)
    expect(generalSettingsStore.isDirty.value).toBe(true)
  })

  it('revert clears the sessionStorage temp copy', async () => {
    generalSettingsStore.state.activeGeneral.rewindSeconds = 30
    await new Promise((r) => setTimeout(r, 0))
    expect(sessionStorage.getItem('mediagrid_temp_general')).not.toBeNull()

    generalSettingsStore.revert()
    expect(sessionStorage.getItem('mediagrid_temp_general')).toBeNull()
  })

  it('savePermanently POSTs the active settings, then moves the server baseline forward and clears dirty state', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)

    generalSettingsStore.state.activeGeneral.tilePct = 0.5
    expect(generalSettingsStore.isDirty.value).toBe(true)

    await generalSettingsStore.savePermanently()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/general-settings',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(generalSettingsStore.isDirty.value).toBe(false)
    expect(generalSettingsStore.state.serverGeneral.tilePct).toBe(0.5)

    vi.unstubAllGlobals()
  })
})
