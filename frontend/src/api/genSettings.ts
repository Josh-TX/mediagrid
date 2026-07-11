import type { GenSettingsResponse, ThumbnailSettings, HighlightSettings } from '../types'

export async function fetchGenSettings(): Promise<GenSettingsResponse> {
  const res = await fetch('/api/gen-settings')
  if (!res.ok) throw new Error(`GET /api/gen-settings failed: ${res.status}`)
  return res.json()
}

export async function triggerGenThumbnails(settings: ThumbnailSettings): Promise<void> {
  const res = await fetch('/api/gen-thumbnails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error(`POST /api/gen-thumbnails failed: ${res.status}`)
}

export async function triggerGenHighlights(settings: HighlightSettings): Promise<void> {
  const res = await fetch('/api/gen-highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error(`POST /api/gen-highlights failed: ${res.status}`)
}
