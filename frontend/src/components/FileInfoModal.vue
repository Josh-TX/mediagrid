<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Tile } from '../types'
import { formatClock, formatDate, formatFilesize } from '../format'
import { dirOf, splitNameExt } from '../pathUtils'
import { mediaUrl } from '../api/shuffle'
import { deleteMedia, moveMedia, renameMedia } from '../api/media'
import MoveCopyPanel from './MoveCopyPanel.vue'
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
  if (!panel.value?.closeConfirm()) onClose()
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

// --- Move view: the shared MoveCopyPanel picks the destination; this only
// performs the single-file move and updates the gallery.
const mode = ref<'info' | 'move'>('info')
const moving = ref(false)
const moveError = ref('')
const isCopy = ref(false)
const panel = ref<InstanceType<typeof MoveCopyPanel> | null>(null)

function onMoveOpen(copy: boolean) {
  mode.value = 'move'
  isCopy.value = copy
  moveError.value = ''
}

async function onSubmit(p: { destDir: string; newName: string | null; overwrite: boolean }) {
  moving.value = true
  moveError.value = ''
  try {
    const res = await moveMedia(props.tile.path, p.destDir, p.newName ?? filename.value, p.overwrite, isCopy.value)
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

      <MoveCopyPanel
        v-else
        ref="panel"
        :tiles="[tile]"
        :is-copy="isCopy"
        :moving="moving"
        :error="moveError"
        back-label="Back"
        @back="mode = 'info'"
        @submit="onSubmit"
      />
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

</style>
