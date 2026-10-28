import type { Tile } from './types'
import { deleteMedia, HttpError, listDir, moveMedia } from './api/media'
import { basename, dirOf, splitNameExt } from './pathUtils'
import { galleryStore } from './stores/galleryStore'
import { selectionStore } from './stores/selectionStore'

export interface ConflictDecision {
  action: 'skip' | 'override' | 'rename' | 'custom'
  // Only for 'custom'.
  newName?: string
  // Reuse this action for every later conflict; ignored for 'custom'.
  applyAll: boolean
}

export interface ConflictRequest {
  name: string
  destDir: string
  // Set when a custom name was already tried and also collided.
  retry: boolean
  // Files after this one still to process.
  remaining: number
}

export interface BulkSummary {
  moved: number
  copied: number
  skipped: number
  failed: number
}

export function isFileConflict(err: unknown): boolean {
  return err instanceof HttpError && err.status === 409 && /file already exists/i.test(err.message)
}

// "photo.jpg" -> "photo (1).jpg", "photo (2).jpg", ... first not in `taken`.
export function autoRename(name: string, taken: Set<string>): string {
  const { base, ext } = splitNameExt(name)
  for (let n = 1; ; n++) {
    const candidate = `${base} (${n})${ext}`
    if (!taken.has(candidate)) return candidate
  }
}

function normDir(p: string): string {
  return '/' + p.replace(/^\/+|\/+$/g, '')
}

// Sequentially moves/copies each tile into destDir, keeping each file's own
// name. On a file-name conflict, asks `resolve` what to do. Mirrors the
// single-file tile updates in FileInfoModal.
export async function bulkMove(
  tiles: Tile[],
  destDir: string,
  copy: boolean,
  resolve: (req: ConflictRequest) => Promise<ConflictDecision>,
  // Single-file case only: the picker already chose a name / confirmed overwrite.
  single?: { newName?: string; overwrite?: boolean },
): Promise<BulkSummary> {
  const summary: BulkSummary = { moved: 0, copied: 0, skipped: 0, failed: 0 }
  let sticky: 'skip' | 'override' | 'rename' | null = null
  let taken: Set<string> | null = null
  const existingNames = async () => {
    if (!taken) {
      try {
        taken = new Set((await listDir(destDir)).entries.map((e) => e.name))
      } catch {
        taken = new Set()
      }
    }
    return taken
  }

  for (const [index, tile] of tiles.entries()) {
    const initialName = single?.newName ?? basename(tile.path)
    // Already in the destination: nothing to do (and "overwriting" itself would be destructive).
    if (normDir(dirOf(tile.path)) === normDir(destDir) && initialName === basename(tile.path)) {
      summary.skipped++
      continue
    }
    let name = initialName
    let overwrite = single?.overwrite ?? false
    let retry = false
    for (;;) {
      try {
        const res = await moveMedia(tile.path, destDir, name, overwrite, copy)
        if (copy) summary.copied++
        else {
          summary.moved++
          if (res.inLibrary) galleryStore.renameTile(tile.tilei, res.path)
          else selectionStore.bustTile(tile.tilei)
        }
        const names = await existingNames()
        names.add(name)
        break
      } catch (err) {
        if (!isFileConflict(err)) {
          summary.failed++
          console.error(`bulk move failed for ${tile.path}`, err)
          break
        }
        const decision: ConflictDecision = sticky
          ? { action: sticky, applyAll: true }
          : await resolve({ name, destDir, retry, remaining: tiles.length - index - 1 })
        if (decision.applyAll && decision.action !== 'custom') sticky = decision.action
        if (decision.action === 'skip') {
          summary.skipped++
          break
        }
        if (decision.action === 'override') {
          overwrite = true
        } else if (decision.action === 'rename') {
          const names = await existingNames()
          names.add(name)
          name = autoRename(basename(tile.path), names)
          retry = false
        } else {
          name = decision.newName ?? name
          retry = true
        }
      }
    }
  }
  return summary
}

export async function bulkDelete(tiles: Tile[]): Promise<{ deleted: number; failed: number }> {
  let deleted = 0
  let failed = 0
  for (const tile of tiles) {
    try {
      await deleteMedia(tile.path)
      selectionStore.bustTile(tile.tilei)
      deleted++
    } catch (err) {
      failed++
      console.error(`bulk delete failed for ${tile.path}`, err)
    }
  }
  return { deleted, failed }
}

export function summaryText(parts: [number, string][]): string {
  const text = parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(', ')
  return text || 'nothing to do'
}
