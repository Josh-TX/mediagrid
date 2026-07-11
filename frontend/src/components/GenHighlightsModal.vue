<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchGenSettings, triggerGenHighlights } from '../api/genSettings'
import { presetsStore } from '../stores/presetsStore'
import type { HighlightSettings } from '../types'

const emit = defineEmits<{ close: []; generate: [] }>()

const RESOLUTION_OPTIONS = [300, 400, 500, 600, 700, 800, 1000]

const loaded = ref(false)
const settings = ref<HighlightSettings>({
  targetPixels: 360000,
  override: false,
  segmentCount: 5,
  segmentDuration: 1.5,
  maxProportion: 3,
  ffmpegArgs: '-c:v libx264 -crf 25 -preset fast',
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

const maxHighlightDuration = computed(() => settings.value.segmentCount * settings.value.segmentDuration)
const minDurationFor1Segment = computed(() => settings.value.segmentDuration * settings.value.maxProportion)
const minDurationForAllSegments = computed(() => maxHighlightDuration.value * settings.value.maxProportion)

onMounted(async () => {
  const resp = await fetchGenSettings()
  settings.value = resp.highlight
  loaded.value = true
})

function onTogglePresetFilter() {
  if (settings.value.usePresetFilter && !settings.value.presetName) {
    settings.value.presetName = presetsStore.state.selectedName
  }
}

async function onGenerate() {
  await triggerGenHighlights(settings.value)
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
      <h3>Gen Highlights</h3>

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
        <label>Segment count</label>
        <input type="number" min="1" step="1" v-model.number="settings.segmentCount" />
      </div>

      <div class="row">
        <label>Segment duration (s)</label>
        <input type="number" min="0.1" step="0.1" v-model.number="settings.segmentDuration" />
      </div>

      <div class="row">
        <label>Max proportion</label>
        <input type="number" min="1" step="0.1" v-model.number="settings.maxProportion" />
      </div>

      <div class="row">
        <label>ffmpeg arg</label>
        <input type="text" v-model="settings.ffmpegArgs" />
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
        <div>Max highlight duration: {{ maxHighlightDuration.toFixed(1) }}s</div>
        <div>Min video duration (1 segment): {{ minDurationFor1Segment.toFixed(1) }}s</div>
        <div>Min video duration (all segments): {{ minDurationForAllSegments.toFixed(1) }}s</div>
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
