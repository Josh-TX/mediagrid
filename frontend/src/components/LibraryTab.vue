<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { fetchLibrary, saveLibrary } from '../api/library'
import type { LibrarySettings } from '../types'

const emit = defineEmits<{ close: []; dirty: [boolean] }>()

const mediaRoot = ref('')
const dataRoot = ref('')
const loaded = ref(false)

const emptySettings = (): LibrarySettings => ({
  whitelistCSV: '',
  blacklistCSV: '',
  whitelistContainsCSV: '',
  blacklistContainsCSV: '',
})
const draft = reactive<LibrarySettings>(emptySettings())
const saved = ref<LibrarySettings>(emptySettings())

const fields: { key: keyof LibrarySettings; label: string; placeholder: string }[] = [
  { key: 'whitelistCSV', label: 'Whitelist CSV: starts with', placeholder: 'e.g. movies/, photos/2024' },
  { key: 'whitelistContainsCSV', label: 'Whitelist CSV: contains', placeholder: 'e.g. vacation, raw/' },
  { key: 'blacklistCSV', label: 'Blacklist CSV: starts with', placeholder: 'e.g. movies/trailers/, tmp/' },
  { key: 'blacklistContainsCSV', label: 'Blacklist CSV: contains', placeholder: 'e.g. sample, trailer' },
]

function snapshot(): LibrarySettings {
  return {
    whitelistCSV: draft.whitelistCSV,
    blacklistCSV: draft.blacklistCSV,
    whitelistContainsCSV: draft.whitelistContainsCSV,
    blacklistContainsCSV: draft.blacklistContainsCSV,
  }
}

onMounted(async () => {
  try {
    const lib = await fetchLibrary()
    mediaRoot.value = lib.mediaRoot
    dataRoot.value = lib.dataRoot
    Object.assign(draft, {
      whitelistCSV: lib.whitelistCSV,
      blacklistCSV: lib.blacklistCSV,
      whitelistContainsCSV: lib.whitelistContainsCSV,
      blacklistContainsCSV: lib.blacklistContainsCSV,
    })
    saved.value = snapshot()
    loaded.value = true
  } catch (err) {
    console.error(err)
  }
})

const isDirty = computed(() => JSON.stringify(snapshot()) !== JSON.stringify(saved.value))

watch(isDirty, (dirty) => emit('dirty', dirty))

function onRevert() {
  Object.assign(draft, saved.value)
}

async function onSave() {
  try {
    const next = snapshot()
    await saveLibrary(next)
    saved.value = next
  } catch (err) {
    console.error(err)
  }
}
</script>

<template>
  <section class="body">
    <div class="section">
      <div class="field">
        <span class="label">Media root</span>
        <code class="path">{{ mediaRoot }}</code>
      </div>
      <div class="field">
        <span class="label">Data root</span>
        <code class="path">{{ dataRoot }}</code>
      </div>
    </div>

    <div class="section">
      <h3>Library filter</h3>
      <p class="hint">Case-insensitive, relative to the media root. Applied on next scan + clean.</p>
      <label v-for="f in fields" :key="f.key" class="field stacked">
        <span class="label">{{ f.label }}</span>
        <input type="text" v-model="draft[f.key]" :disabled="!loaded" :placeholder="f.placeholder" />
      </label>
    </div>
  </section>

  <footer class="footer">
    <button type="button" @click="emit('close')">Close</button>
    <div class="spacer" />
    <button type="button" :disabled="!isDirty" @click="onRevert">Revert</button>
    <button type="button" :disabled="!isDirty" @click="onSave">Save</button>
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

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
  border-bottom: 1px solid #2c2c2c;
}
.stacked input {
  width: 100%;
  box-sizing: border-box;
}

.label {
  font-size: 13px;
}

.path {
  word-break: break-all;
  opacity: 0.8;
  user-select: all;
}

.hint {
  margin: 0 0 8px;
  font-size: 12px;
  opacity: 0.65;
  line-height: 1.4;
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
