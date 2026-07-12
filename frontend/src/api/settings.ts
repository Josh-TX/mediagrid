import type { GeneralSettings, SettingsResponse } from '../types'

export async function fetchSettings(): Promise<SettingsResponse> {
  const res = await fetch('/api/settings')
  if (!res.ok) throw new Error(`GET /api/settings failed: ${res.status}`)
  return res.json()
}

export async function saveGeneralSettings(general: GeneralSettings): Promise<void> {
  const res = await fetch('/api/general-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(general),
  })
  if (!res.ok) throw new Error(`POST /api/general-settings failed: ${res.status}`)
}
