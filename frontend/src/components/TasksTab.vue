<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { tasksStore } from '../stores/tasksStore'
import { triggerScan } from '../api/tasks'
import GenThumbnailsModal from './GenThumbnailsModal.vue'
import GenHighlightsModal from './GenHighlightsModal.vue'
import type { TaskInfo } from '../types'

const showThumbnailsModal = ref(false)
const showHighlightsModal = ref(false)

onMounted(() => tasksStore.startPolling())
onUnmounted(() => tasksStore.stopPolling())

const recentNewestFirst = computed(() => [...tasksStore.state.recent].reverse())

async function onScan(clean: boolean) {
  try {
    await triggerScan(clean)
    await tasksStore.refresh()
  } catch (err) {
    console.error(err)
  }
}

async function onGenerated() {
  await tasksStore.refresh()
}

async function onCancel(id: string) {
  try {
    await tasksStore.cancel(id)
  } catch (err) {
    console.error(err)
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const sec = totalSeconds % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function runtimeFor(t: TaskInfo): string {
  if (!t.startedAt) return '0s'
  const end = t.finishedAt ?? Date.now()
  return formatDuration(end - t.startedAt)
}

function queuedForDisplay(t: TaskInfo): string {
  return formatDuration(Date.now() - t.queuedAt)
}

function finishedAgo(t: TaskInfo): string {
  if (!t.finishedAt) return ''
  const diffMs = Date.now() - t.finishedAt
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return `${hrs}h ago`
}

function progressLabel(t: TaskInfo): string {
  const base = `${t.processed}/${t.total}`
  return t.failed > 0 ? `${base} (${t.failed} failed)` : base
}
</script>

<template>
  <section class="body">
    <div class="section">
      <h3>Trigger Tasks</h3>
      <div class="trigger-buttons">
        <button type="button" @click="onScan(false)">Scan</button>
        <button type="button" @click="onScan(true)">Scan + Clean</button>
        <button type="button" @click="showThumbnailsModal = true">Gen Thumbnails</button>
        <button type="button" @click="showHighlightsModal = true">Gen Highlights</button>
      </div>
    </div>

    <div class="section">
      <h3>Active Task</h3>
      <div v-if="tasksStore.state.active" class="task-row">
        <span class="task-name">{{ tasksStore.state.active.name }}</span>
        <span class="task-meta">{{ runtimeFor(tasksStore.state.active) }} &middot; {{ progressLabel(tasksStore.state.active) }}</span>
        <button type="button" @click="onCancel(tasksStore.state.active.id)">Cancel</button>
      </div>
      <div v-else class="empty">No active task</div>
    </div>

    <div class="section">
      <h3>Queue</h3>
      <div v-if="tasksStore.state.queue.length === 0" class="empty">Queue is empty</div>
      <div v-for="t in tasksStore.state.queue" :key="t.id" class="task-row">
        <span class="task-name">{{ t.name }}</span>
        <span class="task-meta">queued {{ queuedForDisplay(t) }}</span>
        <button type="button" @click="onCancel(t.id)">Cancel</button>
      </div>
    </div>

    <div class="section">
      <h3>Recent Tasks</h3>
      <div v-if="recentNewestFirst.length === 0" class="empty">No recent tasks</div>
      <div v-for="t in recentNewestFirst" :key="t.id" class="task-row">
        <span class="task-name">{{ t.name }}</span>
        <span class="task-meta">
          {{ t.status }} &middot; {{ progressLabel(t) }} &middot; {{ runtimeFor(t) }} &middot; {{ finishedAgo(t) }}
        </span>
      </div>
    </div>
  </section>

  <GenThumbnailsModal v-if="showThumbnailsModal" @close="showThumbnailsModal = false" @generate="onGenerated" />
  <GenHighlightsModal v-if="showHighlightsModal" @close="showHighlightsModal = false" @generate="onGenerated" />
</template>

<style scoped>
.body {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.section {
  margin-bottom: 20px;
}
.section:last-child {
  margin-bottom: 0;
}

.section h3 {
  margin: 0 0 8px;
  font-size: 14px;
  opacity: 0.7;
}

.trigger-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid #2c2c2c;
}

.task-name {
  font-weight: 600;
  white-space: nowrap;
}

.task-meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.8;
  font-size: 13px;
}

.empty {
  opacity: 0.6;
  font-size: 13px;
  padding: 6px 0;
}

button {
  background: #333;
  color: #fff;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 10px;
  cursor: pointer;
}
</style>
