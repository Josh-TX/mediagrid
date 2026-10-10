<script lang="ts">
type Tab = 'general' | 'presets' | 'library' | 'tasks'
let lastActiveTab: Tab = 'general'
</script>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import GeneralTab from './GeneralTab.vue'
import PresetsTab from './PresetsTab.vue'
import LibraryTab from './LibraryTab.vue'
import TasksTab from './TasksTab.vue'

const emit = defineEmits<{ close: [] }>()

const activeTab = ref<Tab>(lastActiveTab)

// Set by the Library tab while it has unsaved edits. Leaving it (switching
// tabs or closing the modal) asks for confirmation; reload/close-tab gets
// the browser's native prompt via beforeunload.
const libraryDirty = ref(false)

function confirmDiscard(): boolean {
  if (!libraryDirty.value) return true
  if (!window.confirm('Discard unsaved Library changes?')) return false
  libraryDirty.value = false
  return true
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault()
}

watch(libraryDirty, (dirty) => {
  if (dirty) window.addEventListener('beforeunload', onBeforeUnload)
  else window.removeEventListener('beforeunload', onBeforeUnload)
})
onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload))

function setActiveTab(tab: Tab) {
  if (tab === activeTab.value || !confirmDiscard()) return
  activeTab.value = tab
  lastActiveTab = tab
}

// A drag that starts inside the modal and ends on the overlay fires a click
// on the overlay; only close if the press also began on the overlay.
let pressStartedOnOverlay = false

function onOverlayPointerDown(e: PointerEvent) {
  pressStartedOnOverlay = e.target === e.currentTarget
}

function onOverlayClick() {
  if (pressStartedOnOverlay) onClose()
}

function onClose() {
  if (!confirmDiscard()) return
  emit('close')
}
</script>

<template>
  <div
    class="overlay"
    @pointerdown="onOverlayPointerDown"
    @click.self="onOverlayClick"
  >
    <div class="modal">
      <header class="tabbar">
        <button type="button" class="tab" :class="{ active: activeTab === 'general' }" @click="setActiveTab('general')">
          General
        </button>
        <button type="button" class="tab" :class="{ active: activeTab === 'presets' }" @click="setActiveTab('presets')">
          Presets
        </button>
        <button type="button" class="tab" :class="{ active: activeTab === 'library' }" @click="setActiveTab('library')">
          Library
        </button>
        <button type="button" class="tab" :class="{ active: activeTab === 'tasks' }" @click="setActiveTab('tasks')">
          Tasks
        </button>
        <div class="spacer" />
        <button type="button" class="close-btn" @click="onClose" title="Close">&times;</button>
      </header>

      <GeneralTab v-if="activeTab === 'general'" @close="onClose" />
      <PresetsTab v-else-if="activeTab === 'presets'" @close="onClose" />
      <LibraryTab v-else-if="activeTab === 'library'" @close="onClose" @dirty="libraryDirty = $event" />
      <TasksTab v-else @close="onClose" />
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
  width: min(480px, 92vw);
  height: min(640px, 88vh);
  background: #1c1c1c;
  color: #fff;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  overflow: hidden;
}

.tabbar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 14px;
  border-bottom: 1px solid #444;
}

.tab {
  background: none;
  color: #fff;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 12px 2px;
  font-size: 14px;
  cursor: pointer;
  opacity: 0.6;
}
.tab.active {
  opacity: 1;
  border-bottom-color: #fff;
}

.spacer {
  flex: 1;
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
</style>
