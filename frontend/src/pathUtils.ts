import type { TitleMode } from './types'

export function splitNameExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot) } : { base: name, ext: '' }
}

export function dirOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx + 1)
}

export function basename(path: string): string {
  return path.split('/').pop() ?? path
}

// Strips the leading directory segments of `dir` (a dirOf()-style string,
// i.e. either '' or ending in '/') that the preset's basePath fully
// encompasses. Matching is segment-by-segment from the start and stops at
// the first segment that isn't an exact (case-insensitive) match — a
// basePath segment that's only a partial/prefix match of the corresponding
// directory segment (e.g. "my" vs "myvideos") does not count, so nothing
// past that point is stripped.
function stripBaseDir(dir: string, basePath: string): string {
  if (!basePath || !dir) return dir
  const dirSegs = dir.split('/').filter((s) => s.length > 0)
  const baseSegs = basePath.split('/').filter((s) => s.length > 0)
  let count = 0
  while (count < baseSegs.length && count < dirSegs.length && dirSegs[count].toLowerCase() === baseSegs[count].toLowerCase()) {
    count++
  }
  const remaining = dirSegs.slice(count)
  return remaining.length ? remaining.join('/') + '/' : ''
}

// Derives the title text(s) to show for a Tile/Player title, per the
// gallery/player "title" general settings. `top` is only non-empty in
// 'parentTop' mode (the parent directory shown above the main title).
// `basePath` is the currently selected preset's basePath, which is
// excluded from the displayed path when it fully encompasses one or more
// leading directories (see stripBaseDir).
export function titleParts(path: string, mode: TitleMode, showExt: boolean, basePath: string): { top: string; bottom: string } {
  const name = basename(path)
  const displayName = showExt ? name : splitNameExt(name).base
  if (mode === 'filename') return { top: '', bottom: displayName }
  const dir = stripBaseDir(dirOf(path), basePath)
  if (mode === 'parentTop') {
    const parentDir = dir.endsWith('/') ? dir.slice(0, -1) : dir
    return { top: parentDir ? (parentDir.startsWith('/') ? parentDir : '/' + parentDir) : '', bottom: displayName }
  }
  return { top: '', bottom: dir + displayName }
}
