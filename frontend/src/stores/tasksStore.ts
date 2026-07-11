import { reactive } from 'vue'
import type { TaskInfo } from '../types'
import { fetchTasks, cancelTask as apiCancelTask } from '../api/tasks'

const state = reactive<{ active: TaskInfo | null; queue: TaskInfo[]; recent: TaskInfo[] }>({
  active: null,
  queue: [],
  recent: [],
})

let pollTimer: ReturnType<typeof setInterval> | undefined

async function refresh() {
  const data = await fetchTasks()
  state.active = data.active
  state.queue = data.queue
  state.recent = data.recent
}

// This is the app's first polling UI — GET /api/tasks is polled every
// second for near-live progress while the Tasks tab is open, and stopped
// as soon as it isn't.
function startPolling() {
  if (pollTimer) return
  refresh()
  pollTimer = setInterval(refresh, 1000)
}

function stopPolling() {
  clearInterval(pollTimer)
  pollTimer = undefined
}

async function cancel(id: string) {
  await apiCancelTask(id)
  await refresh()
}

export const tasksStore = { state, startPolling, stopPolling, refresh, cancel }
