<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchGenSettings, triggerGenThumbnails } from '../api/genSettings'
import { presetsStore } from '../stores/presetsStore'
import type { ThumbnailSettings } from '../types'

const emit = defineEmits<{ close: []; generate: [] }>()

const RESOLUTION_OPTIONS = [300, 400, 500, 600, 700, 800, 1000]

const loaded = ref(false)
const settings = ref<ThumbnailSettings>({
  quality: 50,
  targetPixels: 360000,
  override: false,
  filter: '',
  usePresetFilter: false,
  presetName: '',
})

// The resolution <select> shows a square side length; the underlying
// setting is the pixel-count product (targetPixels).
const resolution = computed<number>({
  get: () => Math.round(Math.sqrt(settings.value.targetPixels)),
  set: (v) => {
    settings.value.targetPixels = v * v
  },
})

onMounted(async () => {
  const resp = await fetchGenSettings()
  settings.value = resp.thumbnail
  loaded.value = true
})

function onTogglePresetFilter() {
  if (settings.value.usePresetFilter && !settings.value.presetName) {
    settings.value.presetName = presetsStore.state.selectedName
  }
}

async function onGenerate() {
  await triggerGenThumbnails(settings.value)
  emit('generate')
  emit('close')
}

function onClose() {
  emit('close')
}
</script>

<template>
  <div class="overlay" @click.self="onClose">
    <div class="inner-modal" v-if="loaded">
      <h3>Gen Thumbnails</h3>

      <div class="row">
        <label>Webp quality</label>
        <input type="number" min="0" max="100" step="1" v-model.number="settings.quality" />
      </div>

      <div class="row">
        <label>Resolution</label>
        <select v-model.number="resolution">
          <option v-for="r in RESOLUTION_OPTIONS" :key="r" :value="r">{{ r }}x{{ r }}</option>
        </select>
      </div>

      <div class="row">
        <label>Override</label>
        <input type="checkbox" v-model="settings.override" />
      </div>

      <div class="row">
        <label>Filter</label>
        <input type="text" v-model="settings.filter" placeholder="Filter..." />
      </div>

      <div class="row">
        <label>Use Preset Filter</label>
        <input type="checkbox" v-model="settings.usePresetFilter" @change="onTogglePresetFilter" />
      </div>
      <div class="row" v-if="settings.usePresetFilter">
        <label>Preset</label>
        <select v-model="settings.presetName">
          <option v-for="p in presetsStore.state.activePresets" :key="p.name" :value="p.name">{{ p.name }}</option>
        </select>
      </div>

      <div class="actions">
        <button type="button" @click="onClose">Cancel</button>
        <button type="button" @click="onGenerate">Generate</button>
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
  z-index: 110;
}

.inner-modal {
  width: min(360px, 90vw);
  max-height: 88vh;
  overflow-y: auto;
  background: #242424;
  color: #fff;
  border-radius: 6px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inner-modal h3 {
  margin: 0 0 4px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.row input[type='text'],
.row input[type='number'],
.row select {
  width: 140px;
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 4px 6px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.actions button {
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
}
</style>
