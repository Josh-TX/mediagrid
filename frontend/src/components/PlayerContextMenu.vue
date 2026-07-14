<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

// x/y is the anchor point. When triggered by the 3-dot icon, it's the
// icon's top-right corner and the menu opens upward/leftward from there.
// When triggered by a native contextmenu event (right-click/long-press),
// downRight is set and the menu opens downward/rightward from the cursor/
// touch point instead, matching the gallery's context menu. Both are
// clamped to stay within the viewport.
const props = defineProps<{
  x: number
  y: number
  downRight?: boolean
  isVideo: boolean
  loop: boolean
  autoplay: boolean
  speed2x: boolean
}>()

const emit = defineEmits<{
  close: []
  'toggle-loop': []
  'toggle-autoplay': []
  'toggle-speed': []
  info: []
}>()

const ANCHOR_GAP = 8

const menuEl = ref<HTMLElement | null>(null)
const style = ref({ left: `${props.x}px`, top: `${props.y}px` })

function positionMenu() {
  const el = menuEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const maxLeft = window.innerWidth - rect.width - 4
  const maxTop = window.innerHeight - rect.height - 4
  const rawLeft = props.downRight ? props.x : props.x - rect.width
  const rawTop = props.downRight ? props.y : props.y - rect.height - ANCHOR_GAP
  const left = Math.max(4, Math.min(rawLeft, maxLeft))
  const top = Math.max(4, Math.min(rawTop, maxTop))
  style.value = { left: `${left}px`, top: `${top}px` }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  positionMenu()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="backdrop" @click.self="emit('close')" @contextmenu.prevent.self="emit('close')">
    <div ref="menuEl" class="menu" :style="style">
      <template v-if="isVideo">
        <button type="button" class="menu-item" @click="emit('toggle-loop')">
          <span>Loop</span>
          <svg v-if="loop" class="check-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button type="button" class="menu-item" @click="emit('toggle-autoplay')">
          <span>Autoplay</span>
          <svg v-if="autoplay" class="check-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </button>
        <button type="button" class="menu-item" @click="emit('toggle-speed')">
          <span>x2 Speed</span>
          <svg v-if="speed2x" class="check-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </template>
      <button type="button" class="menu-item" @click="emit('info')">
        <span>Info</span>
      </button>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
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

.check-icon {
  flex-shrink: 0;
}
</style>
