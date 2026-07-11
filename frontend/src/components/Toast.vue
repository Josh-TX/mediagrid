<script setup lang="ts">
import { toastStore } from '../stores/toastStore'
</script>

<template>
  <div v-if="toastStore.state.message" class="toast" @click="toastStore.dismiss">
    {{ toastStore.state.message }}
  </div>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 60;
  max-width: 90vw;
  padding: 10px 16px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  text-align: center;
  cursor: pointer;
}
</style>
