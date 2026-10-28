<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConflictDecision, ConflictRequest } from '../bulkOps'

// Asks what to do about one file whose name already exists at the
// destination. "Apply to all" covers skip / override / auto-rename; a custom
// name is always per-file.
const props = defineProps<{ request: ConflictRequest }>()
const emit = defineEmits<{ decide: [decision: ConflictDecision] }>()

const applyAll = ref(false)
const customName = ref(props.request.name)
const customTrimmed = computed(() => customName.value.trim())
const customInvalid = computed(() => !customTrimmed.value || /[\\/]/.test(customTrimmed.value) || customTrimmed.value === props.request.name)

function decide(action: 'skip' | 'override' | 'rename') {
  emit('decide', { action, applyAll: applyAll.value })
}
function submitCustom() {
  if (customInvalid.value) return
  emit('decide', { action: 'custom', newName: customTrimmed.value, applyAll: false })
}
</script>

<template>
  <div class="overlay">
    <div class="modal">
      <header class="header">Name conflict</header>
      <div class="body">
        <div>
          <span v-if="request.retry">That name is also taken. </span>"{{ request.name }}" already exists in {{ request.destDir }}.
        </div>
        <div class="custom">
          <input v-model="customName" type="text" autocapitalize="off" spellcheck="false" @keydown.enter="submitCustom" />
          <button type="button" :disabled="customInvalid" @click="submitCustom">Rename</button>
        </div>
        <label v-if="request.remaining > 0" class="apply-all">
          <input v-model="applyAll" type="checkbox" /> Apply to all remaining conflicts (skip / override / auto-rename)
        </label>
      </div>
      <footer class="footer">
        <button type="button" @click="decide('skip')">Skip</button>
        <button type="button" @click="decide('rename')">Auto-rename</button>
        <button type="button" class="danger" @click="decide('override')">Override</button>
      </footer>
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
  z-index: 130;
}
.modal {
  width: min(520px, 94vw);
  background: #1c1c1c;
  color: #fff;
  border-radius: 6px;
  overflow: hidden;
}
.header {
  padding: 12px 14px;
  font-size: 14px;
  border-bottom: 1px solid #444;
}
.body {
  padding: 12px 16px;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-wrap: anywhere;
}
.custom {
  display: flex;
  gap: 8px;
}
.custom input[type='text'] {
  flex: 1;
  min-width: 0;
  background: #111;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 14px;
}
.apply-all {
  font-size: 13px;
  opacity: 0.85;
}
.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid #444;
}
button {
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 14px;
  cursor: pointer;
}
button:hover {
  background: rgba(255, 255, 255, 0.15);
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
button.danger {
  border-color: #ff6b6b;
}
</style>
