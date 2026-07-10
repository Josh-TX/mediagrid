<script setup lang="ts">
import { ref } from 'vue'
import { uiStore } from '../stores/uiStore'
import { presetsStore } from '../stores/presetsStore'
import type { SortType } from '../types'

const emit = defineEmits<{
  refetch: []
  reshuffle: []
  openSettings: []
}>()

let filterDebounce: ReturnType<typeof setTimeout> | undefined
const filterInput = ref(uiStore.state.filterText)

function onFilterInput() {
  clearTimeout(filterDebounce)
  filterDebounce = setTimeout(() => {
    uiStore.setFilterText(filterInput.value)
    emit('refetch')
  }, 300)
}

function onSortTypeChange(e: Event) {
  uiStore.setSortType((e.target as HTMLSelectElement).value as SortType)
  emit('refetch')
}

function onSortButtonClick() {
  if (uiStore.state.sortType === 'rand') {
    emit('reshuffle')
  } else {
    uiStore.toggleDir()
    emit('refetch')
  }
}

function onPresetChange(e: Event) {
  const name = (e.target as HTMLSelectElement).value
  presetsStore.selectPreset(name)
  const preset = presetsStore.selectedPreset.value
  if (preset) uiStore.setSortFromPreset(preset.defaultSort)
  emit('refetch')
}
</script>

<template>
  <div class="toolbar">
    <button class="icon-btn" type="button" @click="onSortButtonClick" :title="uiStore.state.sortType === 'rand' ? 'Re-randomize' : 'Toggle sort direction'">
      <span v-if="uiStore.state.sortType === 'rand'">&#8635;</span>
      <span v-else>{{ uiStore.state.sortDir === 'asc' ? '▲' : '▼' }}</span>
    </button>

    <select class="sort-select" :value="uiStore.state.sortType" @change="onSortTypeChange">
      <option value="rand">Rand</option>
      <option value="size">Size</option>
      <option value="az">A-Z</option>
      <option value="date">Date</option>
    </select>

    <input
      class="filter-input"
      type="text"
      placeholder="Filter..."
      v-model="filterInput"
      @input="onFilterInput"
    />

    <select
      class="preset-select"
      :value="presetsStore.state.selectedName"
      @change="onPresetChange"
    >
      <option v-for="p in presetsStore.state.activePresets" :key="p.name" :value="p.name">
        {{ p.name }}
      </option>
    </select>

    <button class="icon-btn" type="button" @click="emit('openSettings')" title="Settings">
      &#9881;
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
}

.icon-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 4px;
}

.sort-select {
  width: 4.5em;
}

.filter-input {
  flex: 1;
  min-width: 0;
}

.preset-select {
  max-width: 8em;
}

select,
input {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 3px;
  padding: 4px;
}

select option {
  color: #000;
}
</style>
