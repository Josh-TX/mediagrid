<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { DirListing } from '../api/media'

// Breadcrumb <-> typed-path picker for a directory. Owns only its editing
// state; the parent owns the committed path (modelValue) and decides whether
// a requested navigation succeeds (update:modelValue is a *request*).
const props = defineProps<{
  modelValue: string
  list: (path: string) => Promise<DirListing>
}>()
const emit = defineEmits<{ 'update:modelValue': [path: string] }>()

const editingPath = ref(false)
const pathInput = ref('/')
const suggestions = ref<string[]>([])
const sugIndex = ref(-1)
const inputEl = ref<HTMLInputElement | null>(null)
const navEl = ref<HTMLElement | null>(null)
let sugSeq = 0
let navTimer: ReturnType<typeof setTimeout> | undefined
const NAV_DEBOUNCE_MS = 200

const crumbs = computed(() => {
  const out = [{ name: '/', path: '/' }]
  let acc = ''
  for (const seg of props.modelValue.split('/').filter(Boolean)) {
    acc += '/' + seg
    out.push({ name: seg, path: acc })
  }
  return out
})

const pathRest = computed({
  get: () => pathInput.value.slice(1),
  set: (v: string) => {
    pathInput.value = '/' + v.replace(/^\/+/, '')
  },
})

watch([() => props.modelValue, editingPath], async () => {
  await nextTick()
  if (navEl.value) navEl.value.scrollLeft = navEl.value.scrollWidth
})

// Mouse wheels only scroll vertically; map them to the crumb bar's x-axis.
function onWheel(e: WheelEvent) {
  const el = navEl.value
  if (!el || el.scrollWidth <= el.clientWidth || e.deltaX !== 0) return
  e.preventDefault()
  el.scrollLeft += e.deltaY
}

async function startEditPath(e: MouseEvent) {
  if (editingPath.value) return
  if ((e.target as HTMLElement).closest('a')) return
  pathInput.value = props.modelValue === '/' ? '/' : props.modelValue + '/'
  editingPath.value = true
  await nextTick()
  inputEl.value?.focus()
  updateSuggestions()
}

function cancelEditPath() {
  clearTimeout(navTimer)
  editingPath.value = false
  suggestions.value = []
  sugIndex.value = -1
  sugSeq++
}

function stripTrailing(p: string): string {
  const t = p.trim().replace(/\/+$/, '')
  return t === '' ? '/' : t
}

function submitPath() {
  const target = stripTrailing(pathInput.value)
  cancelEditPath()
  if (target !== props.modelValue) emit('update:modelValue', target)
}

async function updateSuggestions() {
  const seq = ++sugSeq
  const full = pathInput.value
  const idx = full.lastIndexOf('/')
  const parent = full.slice(0, idx) || '/'
  const prefix = full.slice(idx + 1).toLowerCase()
  try {
    const res = await props.list(parent)
    if (seq !== sugSeq) return
    const base = res.path === '/' ? '' : res.path
    suggestions.value = res.entries
      .filter((e) => e.isDir && e.name.toLowerCase().startsWith(prefix))
      .slice(0, 30)
      .map((e) => base + '/' + e.name)
    // Only auto-highlight when something was typed, so a plain Enter submits.
    sugIndex.value = prefix && suggestions.value.length ? 0 : -1
  } catch {
    if (seq !== sugSeq) return
    suggestions.value = []
    sugIndex.value = -1
  }
}

onBeforeUnmount(() => clearTimeout(navTimer))

function onInput(e: Event) {
  const ev = e as InputEvent
  const el = ev.target as HTMLInputElement
  pathRest.value = el.value
  el.value = pathRest.value // reflect normalization (no leading slashes)
  // A typed "/" navigates immediately; any other edit (including deletes)
  // navigates after a short pause.
  clearTimeout(navTimer)
  if (ev.inputType.startsWith('insert') && pathInput.value.endsWith('/')) {
    emit('update:modelValue', stripTrailing(pathInput.value))
  } else {
    navTimer = setTimeout(() => emit('update:modelValue', stripTrailing(pathInput.value)), NAV_DEBOUNCE_MS)
  }
  updateSuggestions()
}

function pickSuggestion(p: string) {
  pathInput.value = p + '/'
  emit('update:modelValue', p)
  inputEl.value?.focus()
  updateSuggestions()
}

function onKeydown(e: KeyboardEvent) {
  const n = suggestions.value.length
  if (e.key === 'Escape') {
    // Cancel edit mode only; don't let the modal's own Escape close it.
    e.stopPropagation()
    cancelEditPath()
  } else if (e.key === 'ArrowDown' && n) {
    e.preventDefault()
    sugIndex.value = (sugIndex.value + 1) % n
  } else if (e.key === 'ArrowUp' && n) {
    e.preventDefault()
    sugIndex.value = (sugIndex.value - 1 + n) % n
  } else if (e.key === 'Tab' && n) {
    e.preventDefault()
    pickSuggestion(suggestions.value[sugIndex.value >= 0 ? sugIndex.value : 0])
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (sugIndex.value >= 0 && suggestions.value[sugIndex.value]) pickSuggestion(suggestions.value[sugIndex.value])
    else submitPath()
  }
}
</script>

<template>
  <div class="path-wrap">
    <div class="path-box" :class="{ editing: editingPath }" @click="startEditPath">
      <nav v-if="!editingPath" ref="navEl" class="crumbs" aria-label="breadcrumb" @wheel="onWheel">
        <ul>
          <li v-for="(c, i) in crumbs" :key="c.path">
            <strong v-if="i === crumbs.length - 1">{{ c.name }}</strong>
            <a v-else href="#" @click.prevent="emit('update:modelValue', c.path)">{{ c.name }}</a>
          </li>
        </ul>
      </nav>
      <div v-else class="edit">
        <span class="slash">/</span>
        <input
          ref="inputEl"
          type="text"
          autocapitalize="off"
          autocomplete="off"
          spellcheck="false"
          :value="pathRest"
          @input="onInput"
          @keydown="onKeydown"
          @blur="cancelEditPath"
        />
      </div>
    </div>
    <ul v-if="editingPath && suggestions.length" class="suggestions">
      <li
        v-for="(s, i) in suggestions"
        :key="s"
        :class="{ active: i === sugIndex }"
        @mousedown.prevent
        @click="pickSuggestion(s)"
      >
        {{ s }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.path-wrap {
  position: relative;
}
.path-box {
  position: relative;
  border: 1px solid #555;
  background: #111;
  border-radius: 4px;
  padding: 6px 10px;
  cursor: text;
  font-family: monospace;
  font-size: 14px;
}
.path-box:focus-within {
  border-color: #8ab4ff;
}
.crumbs {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.crumbs ul {
  display: flex;
  flex-wrap: nowrap;
  width: max-content;
  min-width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}
.crumbs li {
  position: relative;
  white-space: nowrap;
  flex-shrink: 0;
}
.crumbs li:not(:first-child) {
  margin-inline-start: 1.75rem;
}
/* Absolute so it takes no layout space; the gap above holds it instead. */
.crumbs li:not(:last-child)::after {
  content: '>';
  position: absolute;
  left: 100%;
  width: 1.75rem;
  text-align: center;
  opacity: 0.5;
}
.crumbs a {
  position: relative;
  z-index: 1; /* keep link hit areas above the > */
  color: #8ab4ff;
  text-decoration: none;
}
.crumbs a:hover {
  text-decoration: underline;
}
.crumbs a::before {
  content: '';
  position: absolute;
  inset: -0.25rem -0.875rem;
}
.edit {
  position: relative;
}
.slash {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  user-select: none;
}
.edit input {
  width: 100%;
  box-sizing: border-box;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font: inherit;
  padding: 0 0 0 1.5ch;
  margin: 0;
}
.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  max-height: 10rem;
  overflow-y: auto;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  background: #2b2b30;
  border: 1px solid #555;
  border-radius: 4px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6);
  font-family: monospace;
  font-size: 14px;
}
.suggestions li {
  padding: 6px 10px;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.suggestions li.active,
.suggestions li:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
