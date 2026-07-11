import type { ShuffleResult, SortType, SortDir } from '../types'

export interface ShuffleQuery {
  tilePct: number
  screenW: number
  screenH: number
  skipr?: number
  taker?: number
  takei?: number
  f?: string
  sort?: SortType
  dir?: SortDir
  exVids?: boolean
  exImgs?: boolean
  exPort?: boolean
  exLand?: boolean
  minDur?: number
  maxDur?: number
  whitelist?: string
  blacklist?: string
  basepath?: string
  reshuffle?: boolean
}

export async function fetchShuffle(query: ShuffleQuery): Promise<ShuffleResult> {
  const params = new URLSearchParams()
  params.set('tilePct', String(query.tilePct))
  params.set('screenW', String(query.screenW))
  params.set('screenH', String(query.screenH))
  if (query.skipr !== undefined) params.set('skipr', String(query.skipr))
  if (query.taker !== undefined) params.set('taker', String(query.taker))
  if (query.takei !== undefined) params.set('takei', String(query.takei))
  if (query.f) params.set('f', query.f)
  if (query.sort) params.set('sort', query.sort)
  if (query.dir) params.set('dir', query.dir)
  if (query.exVids) params.set('exVids', '1')
  if (query.exImgs) params.set('exImgs', '1')
  if (query.exPort) params.set('exPort', '1')
  if (query.exLand) params.set('exLand', '1')
  if (query.minDur) params.set('minDur', String(query.minDur))
  if (query.maxDur) params.set('maxDur', String(query.maxDur))
  if (query.whitelist) params.set('whitelist', query.whitelist)
  if (query.blacklist) params.set('blacklist', query.blacklist)
  if (query.basepath) params.set('basepath', query.basepath)
  if (query.reshuffle) params.set('reshuffle', '1')

  const res = await fetch(`/api/shuffle?${params.toString()}`)
  if (!res.ok) throw new Error(`GET /api/shuffle failed: ${res.status}`)
  return res.json()
}

// Builds a /media/<path> URL, URL-encoding each path segment since the
// backend returns raw/unencoded paths that may contain unusual characters.
export function mediaUrl(path: string): string {
  return '/media/' + path.split('/').map(encodeURIComponent).join('/')
}
