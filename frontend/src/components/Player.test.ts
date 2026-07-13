import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Player from './Player.vue'
import { galleryStore } from '../stores/galleryStore'
import { playerStore } from '../stores/playerStore'
import type { Row, Tile } from '../types'

function makeTile(tilei: number, overrides: Partial<Tile> = {}): Tile {
  return {
    tilei,
    w: 100,
    path: `media/${tilei}.jpg`,
    isVid: false,
    duration: 0,
    filesize: 1000,
    mdate: 0,
    preview: { w: 100, h: 100, hasThumbnail: false, hasHighlight: false },
    ...overrides,
  }
}

function makeRows(tiles: Tile[]): Row[] {
  return [{ rowi: 0, h: 100, tiles }]
}

beforeEach(() => {
  galleryStore.state.rows = makeRows([makeTile(0), makeTile(1)])
  galleryStore.state.totalRows = 1
  galleryStore.state.totalTiles = 2
  playerStore.state.open = true
  playerStore.state.currentIndex = 0
  playerStore.state.openMode = 'tap'
})

describe('Player failed-load handling', () => {
  it('shows "failed to load image" and still creates neighbor containers, so swipe keeps working on a broken slide', async () => {
    const wrapper = mount(Player, { global: { stubs: { PlayerHud: true } } })
    await wrapper.vm.$nextTick()

    // Only the current slide's container exists until a load (or failure) resolves.
    expect(wrapper.findAll('.container-slot').length).toBe(1)

    await wrapper.find('img').trigger('error')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('failed to load image')
    // The neighbor (next) container is now created despite the failure.
    expect(wrapper.findAll('.container-slot').length).toBe(2)

    wrapper.unmount()
  })

  it('shows "failed to load video" for a failed video tile', async () => {
    galleryStore.state.rows = makeRows([makeTile(0, { isVid: true }), makeTile(1)])
    const wrapper = mount(Player, { global: { stubs: { PlayerHud: true } } })
    await wrapper.vm.$nextTick()

    await wrapper.find('video').trigger('error')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('failed to load video')
    wrapper.unmount()
  })
})
