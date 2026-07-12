import { describe, it, expect, beforeEach } from 'vitest'
import { presetsStore } from './presetsStore'
import { makeDefaultPreset } from '../defaultPreset'

// presetsStore is a module-level singleton, so each test resets it to a
// known two-preset state rather than relying on fresh module instances.
beforeEach(() => {
  presetsStore.state.activePresets = [makeDefaultPreset('default'), makeDefaultPreset('travel')]
  presetsStore.state.serverPresets = presetsStore.state.activePresets.map((p) => ({ ...p }))
  presetsStore.state.selectedName = 'default'
  presetsStore.state.loaded = true
  sessionStorage.clear()
})

describe('presetsStore preset management', () => {
  it('suggestNewPresetName avoids collisions by appending a number', () => {
    expect(presetsStore.suggestNewPresetName()).toBe('New Preset')
    presetsStore.addPreset('New Preset')
    expect(presetsStore.suggestNewPresetName()).toBe('New Preset 2')
  })

  it('addPreset rejects a name that already exists', () => {
    expect(presetsStore.addPreset('travel')).toBe(false)
    expect(presetsStore.state.activePresets).toHaveLength(2)
  })

  it('addPreset appends a default-valued preset and selects it', () => {
    expect(presetsStore.addPreset('night mode')).toBe(true)
    expect(presetsStore.state.activePresets.map((p) => p.name)).toContain('night mode')
    expect(presetsStore.state.selectedName).toBe('night mode')
  })

  it('duplicatePreset copies the source settings under a new name', () => {
    presetsStore.state.activePresets.find((p) => p.name === 'travel')!.basePath = 'trips/'
    expect(presetsStore.duplicatePreset('travel', 'travel copy')).toBe(true)
    const dup = presetsStore.state.activePresets.find((p) => p.name === 'travel copy')
    expect(dup?.basePath).toBe('trips/')
  })

  it('duplicatePreset rejects a name collision', () => {
    expect(presetsStore.duplicatePreset('travel', 'default')).toBe(false)
  })

  it('renamePreset rejects a name collision and keeps the original name', () => {
    expect(presetsStore.renamePreset('travel', 'default')).toBe(false)
    expect(presetsStore.state.activePresets.some((p) => p.name === 'travel')).toBe(true)
  })

  it('renamePreset updates selectedName when renaming the currently-selected preset', () => {
    presetsStore.selectPreset('travel')
    expect(presetsStore.renamePreset('travel', 'trips')).toBe(true)
    expect(presetsStore.state.selectedName).toBe('trips')
  })

  it('deletePreset falls back to "default" when the selected preset is deleted', () => {
    presetsStore.selectPreset('travel')
    presetsStore.deletePreset('travel')
    expect(presetsStore.state.selectedName).toBe('default')
  })

  it('deletePreset falls back to the first remaining preset when "default" itself is deleted', () => {
    presetsStore.selectPreset('default')
    presetsStore.deletePreset('default')
    expect(presetsStore.state.selectedName).toBe('travel')
  })

  it('revert discards local edits and restores server-saved values', () => {
    presetsStore.state.activePresets.find((p) => p.name === 'default')!.basePath = 'edited/'
    presetsStore.revert()
    expect(presetsStore.state.activePresets.find((p) => p.name === 'default')!.basePath).toBe('')
  })

  it('isDirty is false at baseline and true after an edit; revert clears it', () => {
    expect(presetsStore.isDirty.value).toBe(false)
    presetsStore.state.activePresets.find((p) => p.name === 'default')!.basePath = 'edited/'
    expect(presetsStore.isDirty.value).toBe(true)
    presetsStore.revert()
    expect(presetsStore.isDirty.value).toBe(false)
  })
})
