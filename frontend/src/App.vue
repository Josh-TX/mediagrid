<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Toolbar from './components/Toolbar.vue'
import Gallery from './components/Gallery.vue'
import SettingsModal from './components/SettingsModal.vue'
import Player from './components/Player.vue'
import Toast from './components/Toast.vue'
import { galleryStore } from './stores/galleryStore'
import { playerStore } from './stores/playerStore'
import { urlStore } from './stores/urlStore'
import { SLIDE_DURATION_MS } from './playerConstants'

const settingsOpen = ref(false)
const ready = ref(false)

function openSettings() {
  settingsOpen.value = true
}

function closeSettings() {
  settingsOpen.value = false
  urlStore.refetchGallery()
}

onMounted(async () => {
  await urlStore.init()
  ready.value = true
})
</script>

<template>
  <div class="app">
    <template v-if="ready">
      <Gallery />
      <Toolbar @refetch="urlStore.refetchGallery" @reshuffle="urlStore.reshuffle" @open-settings="openSettings" />

      <div v-if="galleryStore.state.loading && !playerStore.state.open" class="status">Loading...</div>
      <div v-else-if="galleryStore.state.error && !playerStore.state.open" class="status">
        Failed to load. <button type="button" @click="galleryStore.retry">Retry</button>
      </div>

      <SettingsModal v-if="settingsOpen" @close="closeSettings" />

      <Transition name="player-slide" :duration="SLIDE_DURATION_MS" @after-enter="playerStore.onOpenTransitionEnd">
        <Player v-if="playerStore.state.open" />
      </Transition>

      <Toast />
    </template>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
}

.status {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  padding: 12px 20px;
  border-radius: 6px;
  z-index: 50;
  text-align: center;
}

.status button {
  margin-left: 8px;
}

.player-slide-enter-active,
.player-slide-leave-active {
  transition-property: transform;
  transition-timing-function: ease;
  transition-duration: 150ms;
}
.player-slide-enter-from,
.player-slide-leave-to {
  transform: translateX(100%);
}
</style>
