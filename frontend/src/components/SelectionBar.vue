<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatFilesize } from '../format'
import { selectionStore } from '../stores/selectionStore'
import { galleryStore } from '../stores/galleryStore'
import { toastStore } from '../stores/toastStore'
import { bulkDelete, bulkMove, summaryText, type ConflictDecision, type ConflictRequest } from '../bulkOps'
import MoveCopyPanel from './MoveCopyPanel.vue'
import ConflictModal from './ConflictModal.vue'

// Footer toolbar shown while multi-select is active, plus the bulk
// move/copy modal and per-file conflict prompts it drives.
const count = computed(() => selectionStore.count())
const sizeText = computed(() => formatFilesize(selectionStore.tiles().reduce((sum, t) => sum + t.filesize, 0)))
const busy = computed({
  get: () => selectionStore.state.busy,
  set: (v) => (selectionStore.state.busy = v),
})
const modalMode = ref<'move' | 'copy' | null>(null)
const conflict = ref<{ request: ConflictRequest; resolve: (d: ConflictDecision) => void } | null>(null)

function exit() {
  if (busy.value) return
  selectionStore.clear()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || busy.value || modalMode.value) return
  exit()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// A reload/reshuffle invalidates the selection (tiles are keyed by tilei).
watch(
  () => galleryStore.state.loading,
  (loading) => {
    if (loading && !busy.value) selectionStore.clear()
  },
)

async function onDelete() {
  const tiles = selectionStore.tiles()
  if (!window.confirm(`Delete ${tiles.length} ${tiles.length === 1 ? 'file' : 'files'}?`)) return
  busy.value = true
  try {
    const { deleted, failed } = await bulkDelete(tiles)
    toastStore.show(summaryText([[deleted, 'deleted'], [failed, 'failed']]))
  } finally {
    busy.value = false
    selectionStore.clear()
  }
}

const moveError = ref('')

async function onSubmit(p: { destDir: string; newName: string | null; overwrite: boolean }) {
  const copy = modalMode.value === 'copy'
  const tiles = selectionStore.tiles()
  busy.value = true
  moveError.value = ''
  try {
    // Single file: the panel already handled the name and overwrite choice.
    const summary = await bulkMove(
      tiles,
      p.destDir,
      copy,
      (request) => new Promise((resolve) => (conflict.value = { request, resolve })),
      p.newName ? { newName: p.newName, overwrite: p.overwrite } : undefined,
    )
    toastStore.show(
      summaryText([[summary.moved, 'moved'], [summary.copied, 'copied'], [summary.skipped, 'skipped'], [summary.failed, 'failed']]),
    )
    modalMode.value = null
    selectionStore.clear()
  } catch (err) {
    moveError.value = (err as Error).message
  } finally {
    busy.value = false
  }
}

function onDecide(d: ConflictDecision) {
  const c = conflict.value
  conflict.value = null
  c?.resolve(d)
}

function closeModal() {
  if (!busy.value) modalMode.value = null
}
</script>

<template>
  <div class="selection-bar">
    <button type="button" class="exit" title="Cancel selection" :disabled="busy" @click="exit">&times;</button>
    <div class="count">
      <div>{{ count }} selected</div>
      <div class="size">{{ sizeText }}</div>
    </div>
    <button type="button" :disabled="busy" @click="modalMode = 'move'">Move</button>
    <button type="button" :disabled="busy" @click="modalMode = 'copy'">Copy</button>
    <button type="button" class="danger" :disabled="busy" @click="onDelete">Delete</button>
  </div>

  <div v-if="modalMode" class="overlay" @click.self="closeModal">
    <div class="modal">
      <header class="header">
        <span class="header-title">{{ modalMode === 'copy' ? 'Copy' : 'Move' }} {{ count }} {{ count === 1 ? 'File' : 'Files' }}</span>
        <button type="button" class="close-btn" :disabled="busy" title="Close" @click="closeModal">&times;</button>
      </header>
      <MoveCopyPanel
        :tiles="selectionStore.tiles()"
        :is-copy="modalMode === 'copy'"
        :moving="busy"
        :error="moveError"
        back-label="Cancel"
        @back="closeModal"
        @submit="onSubmit"
      />
    </div>
  </div>

  <ConflictModal v-if="conflict" :request="conflict.request" @decide="onDecide" />
</template>

<style scoped>
.selection-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
}
.count {
  flex: 1;
  font-size: 14px;
}
.size {
  font-size: 12px;
  opacity: 0.7;
}
button {
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 14px;
  cursor: pointer;
}
button:hover {
  background: rgba(255, 255, 255, 0.15);
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
button.danger {
  border-color: #ff6b6b;
}
button.exit {
  font-size: 20px;
  line-height: 1;
  padding: 2px 10px;
}

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
  border: none;
  width: 30px;
  height: 30px;
  line-height: 1;
  font-size: 22px;
  font-weight: bold;
  padding: 0;
}
</style>
