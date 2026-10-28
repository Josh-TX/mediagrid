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

// Carries the HTTP status so callers can tell a name conflict (409) apart
// from other failures.
export class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function errorMessage(res: Response, context: string): Promise<string> {
  const text = (await res.text().catch(() => '')).trim()
  return text || `${context} failed: ${res.status}`
}

export interface DirEntry {
  name: string
  isDir: boolean
}

export interface DirListing {
  // Canonical (server-normalized) directory: "/" is the media root.
  path: string
  // False when the path isn't an existing directory (a move would create it).
  exists: boolean
  entries: DirEntry[]
}

export async function listDir(path: string): Promise<DirListing> {
  const url = '/api/ls?path=' + encodeURIComponent(path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(await errorMessage(res, `GET ${url}`))
  return res.json()
}

export interface MoveResult {
  path: string
  inLibrary: boolean
}

// Moves (or, with copy, copies) the media file at path into destDir (media-root-relative, "/"-rooted;
// created if missing) as newName (a bare filename). A name clash throws (409 text) unless overwrite is set.
export async function moveMedia(path: string, destDir: string, newName: string, overwrite: boolean, copy = false): Promise<MoveResult> {
  const url = buildRootedUrl('/api/move/', path)
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destDir, newName, overwrite, copy }),
  })
  if (!res.ok) throw new HttpError(await errorMessage(res, `PUT ${url}`), res.status)
  return res.json()
}
