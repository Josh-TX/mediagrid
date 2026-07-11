import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tasksStore } from './tasksStore'
import type { TaskInfo, TasksResponse } from '../types'

function makeTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    id: 't1',
    type: 'scan',
    name: 'Scan',
    status: 'active',
    processed: 1,
    total: 10,
    failed: 0,
    queuedAt: 1000,
    startedAt: 1000,
    ...overrides,
  }
}

let response: TasksResponse
let fetchSpy: ReturnType<typeof vi.fn>

function installFetchMock() {
  fetchSpy = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost/')
    if (url.pathname === '/api/tasks') {
      return { ok: true, json: async () => response }
    }
    if (url.pathname.startsWith('/api/tasks/') && url.pathname.endsWith('/cancel') && init?.method === 'POST') {
      return { ok: true, json: async () => ({}) }
    }
    throw new Error(`unexpected fetch: ${url.pathname}`)
  })
  vi.stubGlobal('fetch', fetchSpy)
}

beforeEach(() => {
  response = { active: null, queue: [], recent: [] }
  installFetchMock()
})

afterEach(() => {
  tasksStore.stopPolling()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('tasksStore', () => {
  it('refresh() populates active/queue/recent from GET /api/tasks', async () => {
    response = { active: makeTask(), queue: [makeTask({ id: 'q1', status: 'queued' })], recent: [] }
    await tasksStore.refresh()
    expect(tasksStore.state.active?.id).toBe('t1')
    expect(tasksStore.state.queue).toHaveLength(1)
    expect(tasksStore.state.queue[0].id).toBe('q1')
  })

  it('cancel() POSTs to /api/tasks/{id}/cancel and then refreshes', async () => {
    await tasksStore.cancel('t1')
    expect(fetchSpy).toHaveBeenCalledWith('/api/tasks/t1/cancel', { method: 'POST' })
    // refresh() is called afterward, hitting GET /api/tasks.
    expect(fetchSpy).toHaveBeenCalledWith('/api/tasks')
  })

  it('startPolling() fetches immediately and again every second, until stopPolling()', async () => {
    vi.useFakeTimers()
    tasksStore.startPolling()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    tasksStore.stopPolling()
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('startPolling() is a no-op if already polling', async () => {
    vi.useFakeTimers()
    tasksStore.startPolling()
    tasksStore.startPolling()
    await vi.advanceTimersByTimeAsync(1000)
    // One immediate fetch from the first call, plus one interval tick — a
    // second concurrent interval would double this.
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
