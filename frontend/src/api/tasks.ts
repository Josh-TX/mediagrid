import type { TasksResponse } from '../types'

export async function fetchTasks(): Promise<TasksResponse> {
  const res = await fetch('/api/tasks')
  if (!res.ok) throw new Error(`GET /api/tasks failed: ${res.status}`)
  return res.json()
}

export async function cancelTask(id: string): Promise<void> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
  if (!res.ok) throw new Error(`POST /api/tasks/${id}/cancel failed: ${res.status}`)
}

export async function triggerScan(clean: boolean): Promise<void> {
  const res = await fetch(`/api/scan?clean=${clean ? '1' : '0'}`)
  if (!res.ok) throw new Error(`GET /api/scan failed: ${res.status}`)
}
