import type { LibraryResponse, LibrarySettings } from '../types'

export async function fetchLibrary(): Promise<LibraryResponse> {
  const res = await fetch('/api/library')
  if (!res.ok) throw new Error(`GET /api/library failed: ${res.status}`)
  return res.json()
}

export async function saveLibrary(settings: LibrarySettings): Promise<void> {
  const res = await fetch('/api/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error(`POST /api/library failed: ${res.status}`)
}
