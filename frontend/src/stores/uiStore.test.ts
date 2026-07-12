import { describe, it, expect } from 'vitest'
import { uiStore } from './uiStore'

describe('uiStore', () => {
  it('setSortFromDefault applies the sort-type-specific default direction', () => {
    uiStore.setSortFromDefault('size')
    expect(uiStore.state.sortType).toBe('size')
    expect(uiStore.state.sortDir).toBe('desc')

    uiStore.setSortFromDefault('dur')
    expect(uiStore.state.sortDir).toBe('desc')

    uiStore.setSortFromDefault('az')
    expect(uiStore.state.sortDir).toBe('asc')
  })

  it('setSortType resets direction to that type default, not the previous type', () => {
    uiStore.setSortType('date') // default desc
    uiStore.toggleDir() // now asc
    expect(uiStore.state.sortDir).toBe('asc')

    uiStore.setSortType('az') // switching type should reset to az's default (asc), not carry over
    expect(uiStore.state.sortDir).toBe('asc')

    uiStore.setSortType('size')
    expect(uiStore.state.sortDir).toBe('desc')
  })

  it('toggleDir flips between asc and desc', () => {
    uiStore.setSortType('size')
    expect(uiStore.state.sortDir).toBe('desc')
    uiStore.toggleDir()
    expect(uiStore.state.sortDir).toBe('asc')
    uiStore.toggleDir()
    expect(uiStore.state.sortDir).toBe('desc')
  })

  it('setFilterText updates filterText', () => {
    uiStore.setFilterText('beach')
    expect(uiStore.state.filterText).toBe('beach')
  })
})
