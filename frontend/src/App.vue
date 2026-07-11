<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Toolbar from './components/Toolbar.vue'
import Gallery from './components/Gallery.vue'
import SettingsModal from './components/SettingsModal.vue'
import Player from './components/Player.vue'
import { presetsStore } from './stores/presetsStore'
import { uiStore } from './stores/uiStore'
import { galleryStore } from './stores/galleryStore'
import { playerStore } from './stores/playerStore'
import { buildShuffleQuery } from './buildShuffleQuery'
import { SLIDE_DURATION_MS } from './playerConstants'

const settingsOpen = ref(false)
const ready = ref(false)

function refetchGallery() {
  const preset = presetsStore.selectedPreset.value
  if (!preset) return
  const query = buildShuffleQuery(
    preset,
    uiStore.state.sortType,
    uiStore.state.sortDir,
    uiStore.state.filterText,
    window.innerWidth,
    window.innerHeight,
  )
  galleryStore.reset(query)
}

function onReshuffle() {
  const preset = presetsStore.selectedPreset.value
  if (!preset) return
  const query = buildShuffleQuery(
    preset,
    uiStore.state.sortType,
    uiStore.state.sortDir,
    uiStore.state.filterText,
    window.innerWidth,
    window.innerHeight,
  )
  galleryStore.reset({ ...query, reshuffle: true })
}

function openSettings() {
  settingsOpen.value = true
}

function closeSettings() {
  settingsOpen.value = false
  refetchGallery()
}

onMounted(async () => {
  await presetsStore.load()
  const preset = presetsStore.selectedPreset.value
  if (preset) uiStore.setSortFromPreset(preset.defaultSort)
  ready.value = true
  refetchGallery()
})
</script>

<template>
  <div class="app">
    <template v-if="ready">
      <Gallery />
      <Toolbar @refetch="refetchGallery" @reshuffle="onReshuffle" @open-settings="openSettings" />

      <div v-if="galleryStore.state.loading" class="status">Loading...</div>
      <div v-else-if="galleryStore.state.error" class="status">
        Failed to load. <button type="button" @click="galleryStore.retry">Retry</button>
      </div>

      <SettingsModal v-if="settingsOpen" @close="closeSettings" />

      <Transition name="player-slide" :duration="SLIDE_DURATION_MS">
        <Player v-if="playerStore.state.open" />
      </Transition>
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
}
.player-slide-enter-from,
.player-slide-leave-to {
  transform: translateX(100%);
}
</style>
