import type { Preset } from '../types'

export async function fetchPresets(): Promise<Preset[]> {
  const res = await fetch('/api/presets')
  if (!res.ok) throw new Error(`GET /api/presets failed: ${res.status}`)
  return res.json()
}

export async function savePresets(presets: Preset[]): Promise<void> {
  const res = await fetch('/api/presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(presets),
  })
  if (!res.ok) throw new Error(`POST /api/presets failed: ${res.status}`)
}
