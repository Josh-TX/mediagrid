<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Tile } from '../types'
import { formatClock, formatDate, formatFilesize } from '../format'
import { dirOf, splitNameExt } from '../pathUtils'
import { mediaUrl } from '../api/shuffle'
import { deleteMedia, listDir, moveMedia, renameMedia, type DirEntry } from '../api/media'
import { fetchLibrary } from '../api/library'
import { inLibrary } from '../libraryFilter'
import type { LibrarySettings } from '../types'
import PathPicker from './PathPicker.vue'
import { galleryStore } from '../stores/galleryStore'
import { toastStore } from '../stores/toastStore'

// Shared between the Gallery (opened from the tile context menu's Info item)
// and the Player (opened from the HUD info icon) — both pass down the same
// reactive Tile object, so renameTile/deleted-driven UI updates are visible
// wherever else that tile happens to be rendered.
const props = defineProps<{ tile: Tile }>()

const emit = defineEmits<{
  close: []
  // Fired only on a successful delete, so a Gallery-side caller can trigger
  // its own cache-bust/forced-reload; the Player needs no such handling.
  deleted: []
}>()

const filename = computed(() => props.tile.path.split('/').pop() ?? props.tile.path)
const rawUrl = computed(() => mediaUrl(props.tile.path))
const dateText = computed(() => formatDate(props.tile.mdate))
const filesizeText = computed(() => formatFilesize(props.tile.filesize))
const resolutionText = computed(() => `${props.tile.preview.w}w x ${props.tile.preview.h}h`)
const durationText = computed(() => formatClock(props.tile.duration))

// Only a press that *started* on the backdrop may dismiss: dragging out of
// the modal and releasing over the backdrop must not close it.
let pressStartedOnOverlay = false
function onOverlayDown(e: PointerEvent) {
  pressStartedOnOverlay = e.target === e.currentTarget
}
function onOverlayClick(close: () => void) {
  if (pressStartedOnOverlay) close()
  pressStartedOnOverlay = false
}

function onClose() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (overwriteConfirmOpen.value) overwriteConfirmOpen.value = false
  else onClose()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// Re-prompts (rather than alerting) on both local validation failures and
// backend errors (e.g. a name conflict), so the user can fix the name and
// resubmit, or cancel out entirely, without losing what they typed.
async function onRename() {
  const { base, ext } = splitNameExt(filename.value)
  let promptValue = base
  let message = `Enter Filename Without Extension (it stays ${ext})`
  for (;;) {
    const input = window.prompt(message, promptValue)
    if (input === null) return
    const trimmed = input.trim()
    if (!trimmed) {
      promptValue = trimmed
      message = `Name cannot be empty. Enter Filename Without Extension (it stays ${ext})`
      continue
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      promptValue = trimmed
      message = `Name cannot contain "/" or "\\". Enter Filename Without Extension (it stays ${ext})`
      continue
    }
    if (trimmed === base) return // unchanged: silent no-op

    const newName = trimmed + ext
    try {
      await renameMedia(props.tile.path, newName)
      galleryStore.renameTile(props.tile.tilei, dirOf(props.tile.path) + newName)
      toastStore.show('file renamed')
      emit('close')
      return
    } catch (err) {
      promptValue = trimmed
      message = `${(err as Error).message}. Enter Filename Without Extension (it stays ${ext})`
    }
  }
}

// --- Move view: replaces the info content with a destination picker. `path`
// is only updated after a listing succeeds (server-canonical), so a typo'd
// path never blanks the folder list.
const mode = ref<'info' | 'move'>('info')
const path = ref('/')
const entries = ref<DirEntry[]>([])
const destExists = ref(true)
const loading = ref(false)
const listError = ref('')
const moving = ref(false)
const moveError = ref('')
const overwriteConfirmOpen = ref(false)
const newName = ref('')
const isCopy = ref(false)
const librarySettings = ref<LibrarySettings | null>(null)
let navSeq = 0

const sourceDir = computed(() => {
  const d = dirOf(props.tile.path).replace(/\/+$/, '')
  return '/' + d
})

async function navigate(requested: string) {
  const seq = ++navSeq
  loading.value = true
  try {
    const res = await listDir(requested)
    if (seq !== navSeq) return
    path.value = res.path
    entries.value = res.entries
    destExists.value = res.exists
    listError.value = ''
  } catch (err) {
    if (seq !== navSeq) return
    listError.value = (err as Error).message
  } finally {
    if (seq === navSeq) loading.value = false
  }
}

// Picker suggestions list directly (no caching).
function pickerList(p: string) {
  return listDir(p)
}

async function onMoveOpen(copy: boolean) {
  mode.value = 'move'
  isCopy.value = copy
  newName.value = filename.value
  moveError.value = ''
  navigate(sourceDir.value === '/' ? '/' : sourceDir.value)
  try {
    librarySettings.value = await fetchLibrary()
  } catch {
    librarySettings.value = null // no warning rather than a false one
  }
}

const folders = computed(() => entries.value.filter((e) => e.isDir))
const files = computed(() => entries.value.filter((e) => !e.isDir))
// Only the rendering is capped (folders first); conflict checks use the full lists.
const MAX_LIST_ITEMS = 300
const shownFolders = computed(() => folders.value.slice(0, MAX_LIST_ITEMS))
const shownFiles = computed(() => files.value.slice(0, MAX_LIST_ITEMS - shownFolders.value.length))
const countText = computed(() => {
  const d = folders.value.length
  const f = files.value.length
  return `${d} ${d === 1 ? 'folder' : 'folders'}, ${f} ${f === 1 ? 'file' : 'files'}`
})
const hiddenCount = computed(() => entries.value.length - shownFolders.value.length - shownFiles.value.length)
const joinPath = (name: string) => (path.value === '/' ? '' : path.value) + '/' + name

const targetName = computed(() => newName.value.trim())
const nameInvalid = computed(() => !targetName.value || /[\\/]/.test(targetName.value))
const unchanged = computed(() => path.value === sourceDir.value && targetName.value === filename.value)
// The file itself is listed in its own folder; that's not a conflict.
const conflictFile = computed(
  () => !unchanged.value && files.value.some((e) => e.name === targetName.value),
)
const conflictFolder = computed(() => folders.value.some((e) => e.name === targetName.value))
const outsideLibrary = computed(
  () => !!librarySettings.value && !inLibrary(joinPath(targetName.value).slice(1), librarySettings.value),
)
const canMove = computed(() => !unchanged.value && !nameInvalid.value && !conflictFolder.value && !moving.value && !loading.value)

function onMoveClick() {
  if (conflictFile.value) overwriteConfirmOpen.value = true
  else doMove(false)
}

async function doMove(overwrite: boolean) {
  overwriteConfirmOpen.value = false
  moving.value = true
  moveError.value = ''
  try {
    const res = await moveMedia(props.tile.path, path.value, targetName.value, overwrite, isCopy.value)
    if (isCopy.value) {
      toastStore.show('file copied')
    } else if (res.inLibrary) {
      galleryStore.renameTile(props.tile.tilei, res.path)
      toastStore.show('file moved')
    } else {
      toastStore.show('file moved (removed from gallery)')
      emit('deleted')
    }
    emit('close')
  } catch (err) {
    moveError.value = (err as Error).message
  } finally {
    moving.value = false
  }
}

async function onDelete() {
  if (!window.confirm(`Delete "${filename.value}"?`)) return
  try {
    await deleteMedia(props.tile.path)
    toastStore.show('file deleted')
    emit('deleted')
    emit('close')
  } catch (err) {
    window.alert((err as Error).message)
  }
}
</script>

<template>
  <div class="overlay" @pointerdown="onOverlayDown" @click.self="onOverlayClick(onClose)">
    <div class="modal">
      <header class="header">
        <span class="header-title">{{ mode === 'move' ? (isCopy ? 'Copy File' : 'Move File') : 'File Info' }}</span>
        <button type="button" class="close-btn" @click="onClose" title="Close">&times;</button>
      </header>

      <template v-if="mode === 'info'">
      <div class="body">
        <div class="info-row">
          <a :href="rawUrl" target="_blank" rel="noopener noreferrer">{{ tile.path }}</a>
        </div>
        <div class="info-row">{{ dateText }}</div>
        <div class="info-row">{{ filesizeText }}</div>
        <div class="info-row">{{ resolutionText }}</div>
        <div v-if="tile.isVid" class="info-row">{{ durationText }}</div>
      </div>

      <footer class="footer">
        <button type="button" @click="onMoveOpen(false)">Move</button>
        <button type="button" @click="onMoveOpen(true)">Copy</button>
        <button type="button" @click="onRename">Rename</button>
        <button type="button" @click="onDelete">Delete</button>
      </footer>
      </template>

      <template v-else>
        <div class="body move-body">
          <label class="field-label" for="move-name">File name</label>
          <input id="move-name" v-model="newName" class="name-input" type="text" autocapitalize="off" spellcheck="false" />
          <label class="field-label">File location (relative to media root)</label>
          <PathPicker :model-value="path" :list="pickerList" @update:model-value="navigate" />

          <div class="dir-count">{{ countText }}</div>
          <ul class="dir-list">
            <li v-for="f in shownFolders" :key="f.name" class="dir-row" @click="navigate(joinPath(f.name))">
              {{ f.name }}/
            </li>
            <li
              v-for="f in shownFiles"
              :key="f.name"
              class="file-row"
              :class="{ conflict: conflictFile && f.name === targetName }"
            >
              {{ f.name }}
            </li>
            <li v-if="hiddenCount > 0" class="empty">…and {{ hiddenCount }} more</li>
            <li v-if="!loading && !destExists" class="empty new-folder">New folder</li>
            <li v-else-if="!loading && !entries.length" class="empty">(empty)</li>
          </ul>
        </div>
        <footer class="footer">
          <div class="messages">
            <div v-if="nameInvalid" class="note error">Name must be non-empty and contain no "/" or "\"</div>
            <div v-if="loading" class="note">Loading…</div>
            <div v-if="listError" class="note error">{{ listError }}</div>
            <div v-if="conflictFile" class="note warn">A file named "{{ targetName }}" already exists here and will be overwritten</div>
            <div v-if="conflictFolder" class="note error">A folder named "{{ targetName }}" exists here</div>
            <div v-if="outsideLibrary" class="note warn">{{ isCopy ? 'Outside the library: the copy won\'t appear in the gallery' : 'Outside the library: will be removed from the gallery' }}</div>
            <div v-if="moveError" class="note error">{{ moveError }}</div>
          </div>
          <button type="button" @click="mode = 'info'">Back</button>
          <button type="button" :disabled="!canMove" :class="{ danger: conflictFile }" @click="onMoveClick">
            {{ isCopy ? 'Copy' : 'Move' }}{{ conflictFile ? ' & Overwrite…' : ' Here' }}
          </button>
        </footer>
      </template>

      <div
        v-if="overwriteConfirmOpen"
        class="overlay confirm-overlay"
        @pointerdown="onOverlayDown"
        @click.self="onOverlayClick(() => (overwriteConfirmOpen = false))"
      >
        <div class="modal confirm-modal">
          <div class="body">
            Overwrite "{{ targetName }}" in {{ path }}? The existing file will be permanently deleted.
          </div>
          <footer class="footer">
            <button type="button" @click="overwriteConfirmOpen = false">Cancel</button>
            <button type="button" class="danger" @click="doMove(true)">Overwrite</button>
          </footer>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  width: min(660px, 94vw);
  background: #1c1c1c;
  color: #fff;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  padding: 0 14px;
  border-bottom: 1px solid #444;
}

.header-title {
  flex: 1;
  padding: 12px 0;
  font-size: 14px;
}

.close-btn {
  background: none;
  color: #fff;
  border: none;
  width: 30px;
  height: 30px;
  line-height: 1;
  font-size: 22px;
  font-weight: bold;
  cursor: pointer;
  padding: 0;
  border-radius: 4px;
  opacity: 0.8;
}
.close-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}

.body {
  padding: 12px 16px;
  font-size: 14px;
}
.info-row {
  padding: 2px 0;
  overflow-wrap: break-word;
}
.info-row a {
  color: #fff;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid #444;
}
.messages {
  margin-right: auto;
  align-self: flex-end;
  text-align: left;
}
.footer button {
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 14px;
  cursor: pointer;
}
.footer button:hover {
  background: rgba(255, 255, 255, 0.15);
}

.move-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field-label {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: -4px;
}
.name-input {
  width: 100%;
  box-sizing: border-box;
  background: #111;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 14px;
}
.name-input:focus {
  outline: none;
  border-color: #8ab4ff;
}
.dir-count {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: -4px;
}
.dir-list {
  list-style: none;
  margin: 0;
  padding: 0;
  height: 32vh;
  flex-shrink: 0;
  overflow-y: auto;
  border: 1px solid #444;
  border-radius: 4px;
}
.dir-row,
.file-row,
.empty {
  padding: 8px 10px;
  overflow-wrap: anywhere;
}
.dir-row {
  cursor: pointer;
}
.dir-row:hover {
  background: rgba(255, 255, 255, 0.12);
}
.file-row {
  opacity: 0.45;
}
.file-row.conflict {
  opacity: 1;
  color: #ffb74d;
}
.empty {
  opacity: 0.5;
  text-align: center;
}
.empty.new-folder {
  opacity: 1;
  color: #fff;
}
.note {
  font-size: 13px;
}
.note.warn {
  color: #ffb74d;
}
.note.error {
  color: #ff6b6b;
}
.footer button:disabled {
  opacity: 0.4;
  cursor: default;
}
.footer button.danger {
  border-color: #ff6b6b;
}
.confirm-overlay {
  z-index: 110;
}
</style>
