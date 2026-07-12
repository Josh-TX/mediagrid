import { describe, it, expect } from 'vitest'
import { buildShuffleQuery } from './buildShuffleQuery'
import { makeDefaultPreset } from './defaultPreset'

describe('buildShuffleQuery', () => {
  it('inverts include* preset flags into ex* query flags', () => {
    const preset = makeDefaultPreset('p')
    preset.includeVids = false
    preset.includePortrait = false

    const q = buildShuffleQuery(preset, 0.15, 'rand', 'asc', '', 1000, 800)

    expect(q.exVids).toBe(true)
    expect(q.exImgs).toBe(false)
    expect(q.exPort).toBe(true)
    expect(q.exLand).toBe(false)
  })

  it('omits zero/empty optional fields rather than sending them as 0/""', () => {
    const preset = makeDefaultPreset('p')
    const q = buildShuffleQuery(preset, 0.15, 'rand', 'asc', '', 1000, 800)

    expect(q.minDur).toBeUndefined()
    expect(q.maxDur).toBeUndefined()
    expect(q.whitelist).toBeUndefined()
    expect(q.blacklist).toBeUndefined()
    expect(q.basepath).toBeUndefined()
    expect(q.f).toBeUndefined()
  })

  it('carries through toolbar sort/dir/filter and screen size independent of the preset', () => {
    const preset = makeDefaultPreset('p')
    const q = buildShuffleQuery(preset, 0.15, 'az', 'desc', 'sunset', 1280, 720)

    expect(q.sort).toBe('az')
    expect(q.dir).toBe('desc')
    expect(q.f).toBe('sunset')
    expect(q.screenW).toBe(1280)
    expect(q.screenH).toBe(720)
  })

  // tilePct now comes from General settings, passed in as a separate
  // argument rather than read off the preset — confirm it's threaded through.
  it('carries the given tilePct through to the query, independent of the preset', () => {
    const preset = makeDefaultPreset('p')
    const q = buildShuffleQuery(preset, 0.33, 'rand', 'asc', '', 1000, 800)

    expect(q.tilePct).toBe(0.33)
  })
})
