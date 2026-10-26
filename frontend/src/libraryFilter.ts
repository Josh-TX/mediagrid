import type { LibrarySettings } from './types'

// Mirror of backend/internal/library InLibrary, so the move modal can warn
// before submitting that a destination is outside the library.
function parseCSV(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, ''))
    .filter((s) => s !== '')
}

export function inLibrary(relPath: string, s: LibrarySettings): boolean {
  const p = relPath.replace(/\\/g, '/').toLowerCase()
  const blS = parseCSV(s.blacklistCSV)
  const blC = parseCSV(s.blacklistContainsCSV)
  if (blS.some((e) => p.startsWith(e)) || blC.some((e) => p.includes(e))) return false
  const wlS = parseCSV(s.whitelistCSV)
  const wlC = parseCSV(s.whitelistContainsCSV)
  if (wlS.length === 0 && wlC.length === 0) return true
  return wlS.some((e) => p.startsWith(e)) || wlC.some((e) => p.includes(e))
}
