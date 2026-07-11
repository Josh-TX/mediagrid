<script setup lang="ts">
import { computed } from 'vue'
import { presetsStore } from '../stores/presetsStore'
import { settingSections } from '../settingsFields'
import type { Preset } from '../types'

const preset = computed<Preset | undefined>(() => presetsStore.selectedPreset.value)

function onPresetSelect(e: Event) {
  presetsStore.selectPreset((e.target as HTMLSelectElement).value)
}

function onNewPreset() {
  const suggested = presetsStore.suggestNewPresetName()
  const name = window.prompt('New preset name:', suggested)
  if (name === null) return
  if (!presetsStore.addPreset(name)) {
    window.alert(`A preset named "${name}" already exists.`)
  }
}

function onDuplicate() {
  if (!preset.value) return
  const suggested = presetsStore.suggestDuplicateName(preset.value.name)
  const name = window.prompt('Duplicate preset as:', suggested)
  if (name === null) return
  if (!presetsStore.duplicatePreset(preset.value.name, name)) {
    window.alert(`A preset named "${name}" already exists.`)
  }
}

function onRename() {
  if (!preset.value) return
  const name = window.prompt('Rename preset to:', preset.value.name)
  if (name === null) return
  if (!presetsStore.renamePreset(preset.value.name, name)) {
    window.alert(`A preset named "${name}" already exists.`)
  }
}

function onDelete() {
  if (!preset.value) return
  if (window.confirm(`Delete preset "${preset.value.name}"?`)) {
    presetsStore.deletePreset(preset.value.name)
  }
}

function showHelp(help: string) {
  window.alert(help)
}

function onRevert() {
  presetsStore.revert()
}

async function onSavePermanently() {
  await presetsStore.savePermanently()
}
</script>

<template>
  <section class="preset-header">
    <select :value="presetsStore.state.selectedName" @change="onPresetSelect">
      <option v-for="p in presetsStore.state.activePresets" :key="p.name" :value="p.name">
        {{ p.name }}
      </option>
    </select>
    <button type="button" @click="onRename">Rename</button>
    <button type="button" @click="onDuplicate">Duplicate</button>
    <button type="button" @click="onDelete">Delete</button>
    <button type="button" @click="onNewPreset">New</button>
  </section>

  <section class="body" v-if="preset">
    <div v-for="section in settingSections" :key="section.title" class="section">
      <h3>{{ section.title }}</h3>
      <div v-for="field in section.fields" :key="field.key" class="row">
        <label class="label">
          {{ field.label }}
          <span class="help" :title="field.help" @click="showHelp(field.help)">?</span>
        </label>
        <div class="input">
          <input
            v-if="field.type === 'float'"
            type="number"
            step="0.01"
            min="0"
            max="1"
            v-model.number="(preset as any)[field.key]"
          />
          <input v-else-if="field.type === 'int'" type="number" step="1" min="0" v-model.number="(preset as any)[field.key]" />
          <input v-else-if="field.type === 'text'" type="text" v-model="(preset as any)[field.key]" />
          <input v-else-if="field.type === 'bool'" type="checkbox" v-model="(preset as any)[field.key]" />
          <select v-else-if="field.type === 'select'" v-model="(preset as any)[field.key]">
            <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="spacer" />
    <button type="button" @click="onRevert">Revert</button>
    <button type="button" @click="onSavePermanently">Save permanently</button>
  </footer>
</template>

<style scoped>
.preset-header {
  display: flex;
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid #444;
  flex-wrap: wrap;
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.section h3 {
  margin: 16px 0 8px;
  font-size: 14px;
  opacity: 0.7;
}
.section:first-child h3 {
  margin-top: 0;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #2c2c2c;
}

.label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid #888;
  font-size: 11px;
  cursor: pointer;
  opacity: 0.8;
}

.input input,
.input select {
  width: 100%;
}

.footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid #444;
}

.spacer {
  flex: 1;
}

button {
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 10px;
  cursor: pointer;
}
</style>
