<script setup lang="ts">
import { computed } from 'vue'
import { generalSettingsStore } from '../stores/generalSettingsStore'
import { generalSettingSections, type SettingField } from '../settingsFields'
import type { GeneralSettings } from '../types'

function boolSelectModel(field: SettingField<GeneralSettings>) {
  return computed({
    get: () => String((generalSettingsStore.state.activeGeneral as any)[field.key]),
    set: (val: string) => {
      ;(generalSettingsStore.state.activeGeneral as any)[field.key] = val === 'true'
    },
  })
}

function showHelp(help: string) {
  window.alert(help)
}

function onRevert() {
  generalSettingsStore.revert()
}

async function onSavePermanently() {
  await generalSettingsStore.savePermanently()
}
</script>

<template>
  <section class="body">
    <div v-for="section in generalSettingSections" :key="section.title" class="section">
      <h3>{{ section.title }}</h3>
      <div v-for="field in section.fields" :key="String(field.key)" class="row">
        <label class="label">
          {{ field.label }}
          <span class="help" :title="field.help" @click="showHelp(field.help)">?</span>
        </label>
        <div class="input">
          <input
            v-if="field.type === 'float'"
            type="number"
            :step="field.step ?? 0.01"
            :min="field.min ?? 0"
            :max="field.max ?? 1"
            v-model.number="(generalSettingsStore.state.activeGeneral as any)[field.key]"
          />
          <input
            v-else-if="field.type === 'int'"
            type="number"
            step="1"
            min="0"
            v-model.number="(generalSettingsStore.state.activeGeneral as any)[field.key]"
          />
          <input
            v-else-if="field.type === 'text'"
            type="text"
            v-model="(generalSettingsStore.state.activeGeneral as any)[field.key]"
          />
          <input
            v-else-if="field.type === 'bool'"
            type="checkbox"
            v-model="(generalSettingsStore.state.activeGeneral as any)[field.key]"
          />
          <select v-else-if="field.type === 'select'" v-model="(generalSettingsStore.state.activeGeneral as any)[field.key]">
            <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <select v-else-if="field.type === 'boolSelect'" v-model="boolSelectModel(field).value">
            <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="spacer" />
    <button type="button" :disabled="!generalSettingsStore.isDirty.value" @click="onRevert">Revert</button>
    <button type="button" :disabled="!generalSettingsStore.isDirty.value" @click="onSavePermanently">Save permanently</button>
  </footer>
</template>

<style scoped>
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

.input input[type='number'] {
  width: 80px;
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
button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
