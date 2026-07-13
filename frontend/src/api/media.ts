import { buildRootedUrl } from './shuffle'

export async function deleteMedia(path: string): Promise<void> {
  const url = buildRootedUrl('/api/delete/', path)
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) throw new Error(await errorMessage(res, `DELETE ${url}`))
}

// Renames the media file at path to newName (a bare filename — same
// directory only). Throws with the backend's own error text (e.g. a name
// conflict) so callers can surface it directly, letting the user fix and
// retry.
export async function renameMedia(path: string, newName: string): Promise<void> {
  const url = buildRootedUrl('/api/rename/', path)
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName }),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `PUT ${url}`))
}

async function errorMessage(res: Response, context: string): Promise<string> {
  const text = (await res.text().catch(() => '')).trim()
  return text || `${context} failed: ${res.status}`
}
