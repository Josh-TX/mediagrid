<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { LibrarySettings, Tile } from '../types'
import { dirOf } from '../pathUtils'
import { listDir, type DirEntry } from '../api/media'
import { fetchLibrary } from '../api/library'
import { inLibrary } from '../libraryFilter'
import PathPicker from './PathPicker.vue'

// Destination picker shared by the single-file File Info modal and the bulk
// move/copy modal. With one tile it also asks for the file name and warns
// about conflicts; with several, each file keeps its name and conflicts are
// resolved one at a time by the caller after submit.
const props = defineProps<{
  tiles: Tile[]
  isCopy: boolean
  moving: boolean
  error: string
  backLabel: string
}>()

const emit = defineEmits<{
  back: []
  submit: [payload: { destDir: string; newName: string | null; overwrite: boolean }]
}>()

const single = computed(() => props.tiles.length === 1)
const filename = computed(() => (single.value ? (props.tiles[0].path.split('/').pop() ?? props.tiles[0].path) : ''))

const path = ref('/')
const entries = ref<DirEntry[]>([])
const destExists = ref(true)
const loading = ref(false)
const listError = ref('')
const overwriteConfirmOpen = ref(false)
const newName = ref(filename.value)
const librarySettings = ref<LibrarySettings | null>(null)
let navSeq = 0

// The folder every selected file lives in, or the root if they differ.
const sourceDir = computed(() => {
  const dirs = new Set(props.tiles.map((t) => '/' + dirOf(t.path).replace(/\/+$/, '')))
  return dirs.size === 1 ? [...dirs][0] : '/'
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

onMounted(async () => {
  navigate(sourceDir.value === '/' ? '/' : sourceDir.value)
  try {
    librarySettings.value = await fetchLibrary()
  } catch {
    librarySettings.value = null // no warning rather than a false one
  }
})

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
const nameInvalid = computed(() => single.value && (!targetName.value || /[\\/]/.test(targetName.value)))
const unchanged = computed(() => path.value === sourceDir.value && (!single.value || targetName.value === filename.value))
// The file itself is listed in its own folder; that's not a conflict.
const conflictFile = computed(
  () => single.value && !unchanged.value && files.value.some((e) => e.name === targetName.value),
)
const conflictFolder = computed(() => single.value && folders.value.some((e) => e.name === targetName.value))
const outsideLibrary = computed(() => {
  const lib = librarySettings.value
  if (!lib) return false
  const names = single.value ? [targetName.value] : props.tiles.map((t) => t.path.split('/').pop() ?? t.path)
  return names.some((n) => !inLibrary(joinPath(n).slice(1), lib))
})
const canSubmit = computed(() => !unchanged.value && !nameInvalid.value && !conflictFolder.value && !props.moving && !loading.value)

function emitSubmit(overwrite: boolean) {
  overwriteConfirmOpen.value = false
  emit('submit', { destDir: path.value, newName: single.value ? targetName.value : null, overwrite })
}

function onSubmitClick() {
  if (conflictFile.value) overwriteConfirmOpen.value = true
  else emitSubmit(false)
}

// Lets the parent's Escape handler dismiss the inner confirm first;
// returns whether there was one to dismiss.
function closeConfirm(): boolean {
  if (!overwriteConfirmOpen.value) return false
  overwriteConfirmOpen.value = false
  return true
}
defineExpose({ closeConfirm })

// Same drag-out-of-modal guard as the parent modals.
let pressStartedOnOverlay = false
function onOverlayDown(e: PointerEvent) {
  pressStartedOnOverlay = e.target === e.currentTarget
}
function onOverlayClick() {
  if (pressStartedOnOverlay) overwriteConfirmOpen.value = false
  pressStartedOnOverlay = false
}
</script>

<template>
  <div class="body move-body">
    <template v-if="single">
      <label class="field-label" for="move-name">File name</label>
      <input id="move-name" v-model="newName" class="name-input" type="text" autocapitalize="off" spellcheck="false" />
    </template>
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
      <div v-if="error" class="note error">{{ error }}</div>
    </div>
    <button type="button" @click="emit('back')">{{ backLabel }}</button>
    <button type="button" :disabled="!canSubmit" :class="{ danger: conflictFile }" @click="onSubmitClick">
      {{ isCopy ? 'Copy' : 'Move' }}{{ conflictFile ? ' & Overwrite…' : ' Here' }}
    </button>
  </footer>

  <div
    v-if="overwriteConfirmOpen"
    class="overlay confirm-overlay"
    @pointerdown="onOverlayDown"
    @click.self="onOverlayClick"
  >
    <div class="modal confirm-modal">
      <div class="body">
        Overwrite "{{ targetName }}" in {{ path }}? The existing file will be permanently deleted.
      </div>
      <footer class="footer">
        <button type="button" @click="overwriteConfirmOpen = false">Cancel</button>
        <button type="button" class="danger" @click="emitSubmit(true)">Overwrite</button>
      </footer>
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
  z-index: 110;
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
.body {
  padding: 12px 16px;
  font-size: 14px;
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
.footer button:disabled {
  opacity: 0.4;
  cursor: default;
}
.footer button.danger {
  border-color: #ff6b6b;
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
</style>
