<script setup lang="ts">
import { ref } from 'vue'
import GeneralTab from './GeneralTab.vue'
import PresetsTab from './PresetsTab.vue'
import TasksTab from './TasksTab.vue'

const emit = defineEmits<{ close: [] }>()

type Tab = 'general' | 'presets' | 'tasks'
const activeTab = ref<Tab>('general')

function onClose() {
  emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="onClose">
    <div class="modal">
      <header class="tabbar">
        <button type="button" class="tab" :class="{ active: activeTab === 'general' }" @click="activeTab = 'general'">
          General
        </button>
        <button type="button" class="tab" :class="{ active: activeTab === 'presets' }" @click="activeTab = 'presets'">
          Presets
        </button>
        <button type="button" class="tab" :class="{ active: activeTab === 'tasks' }" @click="activeTab = 'tasks'">
          Tasks
        </button>
        <div class="spacer" />
        <button type="button" class="close-btn" @click="onClose" title="Close">&times;</button>
      </header>

      <GeneralTab v-if="activeTab === 'general'" />
      <PresetsTab v-else-if="activeTab === 'presets'" />
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
