<script setup lang="ts">
import { ref } from 'vue'
import PresetsTab from './PresetsTab.vue'
import TasksTab from './TasksTab.vue'

const emit = defineEmits<{ close: [] }>()

type Tab = 'presets' | 'tasks'
const activeTab = ref<Tab>('presets')

function onClose() {
  emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="onClose">
    <div class="modal">
      <header class="tabbar">
        <button type="button" class="tab" :class="{ active: activeTab === 'presets' }" @click="activeTab = 'presets'">
          Presets
        </button>
        <button type="button" class="tab" :class="{ active: activeTab === 'tasks' }" @click="activeTab = 'tasks'">
          Tasks
        </button>
        <div class="spacer" />
        <button type="button" class="close-btn" @click="onClose" title="Close">&times;</button>
      </header>

      <PresetsTab v-if="activeTab === 'presets'" />
      <TasksTab v-else />
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
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid #444;
}

.tab {
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  opacity: 0.7;
}
.tab.active {
  opacity: 1;
  border-color: #888;
}

.spacer {
  flex: 1;
}

.close-btn {
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  width: 30px;
  height: 30px;
  line-height: 1;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
}
</style>
