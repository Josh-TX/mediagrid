<script setup lang="ts">
import { computed, ref } from 'vue'
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
const hasFilterValue = computed(() => filterInput.value.trim().length > 0)

function onFilterInput() {
  clearTimeout(filterDebounce)
  filterDebounce = setTimeout(() => {
    uiStore.setFilterText(filterInput.value)
    emit('refetch')
  }, 300)
}

function onFilterClear() {
  clearTimeout(filterDebounce)
  filterInput.value = ''
  uiStore.setFilterText('')
  emit('refetch')
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
      <option value="dur">Dur</option>
    </select>

    <div class="filter-wrap">
      <input
        class="filter-input"
        :class="{ 'has-value': hasFilterValue }"
        type="text"
        placeholder="Filter..."
        v-model="filterInput"
        @input="onFilterInput"
      />
      <button
        v-if="hasFilterValue"
        class="filter-clear"
        type="button"
        @click="onFilterClear"
        title="Clear filter"
      >
        &times;
      </button>
    </div>

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
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0));
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

.filter-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
}

.filter-input {
  flex: 1;
  min-width: 0;
  padding-right: 4px;
}

.filter-clear {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #fff;
  font-weight: bold;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 6px;
}

.preset-select {
  max-width: 8em;
}

select,
input {
  background: none;
  color: #fff;
  border: none;
  border-bottom: 1px solid transparent;
  padding: 4px;
}

input:focus {
  outline: none;
  border-bottom: 1px solid #fff;
}

input.has-value {
  border-bottom: 1px solid #fff;
}

select:focus {
  outline: none;
}

select option {
  color: #000;
}

input::placeholder {
  color: rgba(255, 255, 255, 0.7);
}
</style>
