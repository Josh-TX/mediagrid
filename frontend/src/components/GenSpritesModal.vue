<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchGenSettings, triggerGenSprites } from '../api/genSettings'
import { presetsStore } from '../stores/presetsStore'
import type { SpriteSettings } from '../types'

const emit = defineEmits<{ close: []; generate: [] }>()

// Per-cell resolution (each frame in the sheet), much smaller than a thumbnail.
const RESOLUTION_OPTIONS = [100, 150, 200, 250, 300, 400]

const loaded = ref(false)
const settings = ref<SpriteSettings>({
  quality: 60,
  targetPixels: 40000,
  override: false,
  columns: 4,
  maxRows: 6,
  minDurationTwoRows: 120,
  minDurationMaxRows: 360,
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

// Mirrors the backend's TargetDimensions: even-rounded cell size for a 16:9 source.
function roundToEven(v: number): number {
  const n = Math.round(v)
  return Math.max(2, n % 2 ? n + 1 : n)
}
function sheetResolution(ratio: number) {
  const h = Math.sqrt(settings.value.targetPixels / ratio)
  const cellW = roundToEven(h * ratio)
  const cellH = roundToEven(h)
  return `${cellW * settings.value.columns}x${cellH * settings.value.maxRows}`
}
const sheetResolution169 = computed(() => sheetResolution(16 / 9))
const sheetResolution916 = computed(() => sheetResolution(9 / 16))

const maxFrames = computed(() => settings.value.columns * settings.value.maxRows)

onMounted(async () => {
  const resp = await fetchGenSettings()
  settings.value = resp.sprite
  loaded.value = true
})

function onTogglePresetFilter() {
  if (settings.value.usePresetFilter && !settings.value.presetName) {
    settings.value.presetName = presetsStore.state.selectedName
  }
}

async function onGenerate() {
  await triggerGenSprites(settings.value)
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
      <h3>Gen Sprites</h3>

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
        <label>Webp quality</label>
        <input type="number" min="0" max="100" step="1" v-model.number="settings.quality" />
      </div>

      <div class="row">
        <label>Columns</label>
        <input type="number" min="1" step="1" v-model.number="settings.columns" />
      </div>

      <div class="row">
        <label>Max rows</label>
        <input type="number" min="1" step="1" v-model.number="settings.maxRows" />
      </div>

      <div class="row">
        <label>Min duration for 2 rows (s)</label>
        <input type="number" min="1" step="1" v-model.number="settings.minDurationTwoRows" />
      </div>

      <div class="row">
        <label>Min duration for {{ settings.maxRows }} rows (s)</label>
        <input type="number" min="1" step="1" v-model.number="settings.minDurationMaxRows" />
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

      <div class="info">
        <div>Max frames: {{ maxFrames }}</div>
        <div>Sheet Resolution (16:9, {{ settings.columns }} &times; {{ settings.maxRows }}): {{ sheetResolution169 }}</div>
        <div>Sheet Resolution (9:16, {{ settings.columns }} &times; {{ settings.maxRows }}): {{ sheetResolution916 }}</div>
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

.info {
  border-top: 1px solid #444;
  padding-top: 8px;
  font-size: 12px;
  opacity: 0.75;
  display: flex;
  flex-direction: column;
  gap: 2px;
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
