<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

// x/y are viewport coordinates (from the triggering contextmenu event —
// native on both desktop right-click and mobile long-press).
const props = defineProps<{ x: number; y: number }>()

const emit = defineEmits<{
  open: []
  info: []
  close: []
}>()

const menuEl = ref<HTMLElement | null>(null)
const style = ref({ left: `${props.x}px`, top: `${props.y}px` })

// Clamps the menu to stay fully within the viewport, since it opens at the
// cursor/touch point which can be near an edge (especially on mobile).
function clampPosition() {
  const el = menuEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const maxLeft = window.innerWidth - rect.width - 4
  const maxTop = window.innerHeight - rect.height - 4
  const left = Math.max(4, Math.min(props.x, maxLeft))
  const top = Math.max(4, Math.min(props.y, maxTop))
  style.value = { left: `${left}px`, top: `${top}px` }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  clampPosition()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="backdrop" @click.self="emit('close')" @contextmenu.prevent.self="emit('close')">
    <div ref="menuEl" class="menu" :style="style">
      <button type="button" @click="emit('open')">Open</button>
      <button type="button" @click="emit('info')">Info</button>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
}

.menu {
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 150px;
  background: #1c1c1c;
  color: #fff;
  border: 1px solid #444;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.menu button {
  background: none;
  color: #fff;
  border: none;
  text-align: left;
  padding: 10px 14px;
  font-size: 14px;
  cursor: pointer;
}
.menu button:hover {
  background: rgba(255, 255, 255, 0.1);
}
</style>
