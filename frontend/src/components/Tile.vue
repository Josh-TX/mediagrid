<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Tile, AutoPlayTile } from '../types'
import type { TileSource } from '../tilePlayback'
import { mediaUrl, thumbnailUrl, highlightUrl } from '../api/shuffle'
import { deleteMedia, renameMedia } from '../api/media'
import { formatClock } from '../format'
import { resolveTileSource } from '../tilePlayback'
import { playerStore } from '../stores/playerStore'
import { urlStore } from '../stores/urlStore'
import { galleryStore } from '../stores/galleryStore'
import TileContextMenu from './TileContextMenu.vue'

const props = defineProps<{
  tile: Tile
  rowH: number
  cropX: number
  cropY: number
  autoPlayTile: AutoPlayTile
  fallbackToOriginal: boolean
}>()

const hovering = ref(false)

// Crop-then-letterbox hybrid: scale the preview to cover the box, but never
// crop more than cropX/cropY of that axis — if covering would need more, the
// scale backs off toward "contain" on that axis and the remainder is
// letterboxed instead of cropped.
const mediaStyle = computed(() => {
  const boxW = props.tile.w
  const boxH = props.rowH
  const pw = props.tile.preview.w
  const ph = props.tile.preview.h
  const boxAspect = boxW / boxH
  const previewAspect = pw / ph

  let scale: number
  if (previewAspect >= boxAspect) {
    // image relatively wider than box: height fits, width may need cropping
    const coverScale = boxH / ph
    const neededCropX = 1 - boxW / (pw * coverScale)
    if (neededCropX <= props.cropX) {
      scale = coverScale
    } else {
      scale = boxW / (pw * (1 - props.cropX))
    }
  } else {
    // image relatively taller than box: width fits, height may need cropping
    const coverScale = boxW / pw
    const neededCropY = 1 - boxH / (ph * coverScale)
    if (neededCropY <= props.cropY) {
      scale = coverScale
    } else {
      scale = boxH / (ph * (1 - props.cropY))
    }
  }

  const scaledW = pw * scale
  const scaledH = ph * scale
  return {
    width: `${scaledW}px`,
    height: `${scaledH}px`,
    left: `${(boxW - scaledW) / 2}px`,
    top: `${(boxH - scaledH) / 2}px`,
  }
})

const source = computed(() =>
  resolveTileSource({
    isVid: props.tile.isVid,
    hasThumbnail: props.tile.preview.hasThumbnail,
    hasHighlight: props.tile.preview.hasHighlight,
    autoPlayTile: props.autoPlayTile,
    fallbackToOriginal: props.fallbackToOriginal,
    hovering: hovering.value,
  }),
)

// 'original' means "play the original video" when the tile is a video, or
// "load the original image" when it isn't — only isVid disambiguates it.
const isVideoPlaying = computed(() => source.value === 'highlight' || (source.value === 'original' && props.tile.isVid))

// Incremented to force a fresh network request after a successful in-app
// delete, bypassing the browser cache — otherwise the tile would keep
// showing its already-loaded preview instead of flipping to the "failed to
// load" state, which would be misleading about whether the delete worked.
const cacheBust = ref(0)
function withCacheBust(url: string): string {
  return cacheBust.value ? `${url}${url.includes('?') ? '&' : '?'}_=${cacheBust.value}` : url
}

const videoSrc = computed(() => withCacheBust(source.value === 'highlight' ? highlightUrl(props.tile.path) : mediaUrl(props.tile.path)))
const imgSrc = computed(() => withCacheBust(source.value === 'thumbnail' ? thumbnailUrl(props.tile.path) : mediaUrl(props.tile.path)))

// Tracks whether the currently-attempted source failed to load (e.g. the
// file was deleted/renamed, or the shufflelist's stale "//deleted" sentinel
// path). Only one network request is ever attempted per tile — there's no
// fallback chain after a failure, just this message in place of the preview.
const loadFailed = ref(false)
const failedSource = ref<TileSource | null>(null)
const currentSrc = computed(() => (isVideoPlaying.value ? videoSrc.value : imgSrc.value))
watch(currentSrc, () => {
  loadFailed.value = false
})

function onMediaError() {
  loadFailed.value = true
  failedSource.value = source.value
}

const failedMessage = computed(() => {
  if (failedSource.value === 'thumbnail') return 'failed to load thumbnail'
  if (failedSource.value === 'highlight') return 'failed to load highlight'
  if (failedSource.value === 'original') return props.tile.isVid ? 'failed to load video' : 'failed to load image'
  return ''
})

const filename = computed(() => props.tile.path.split('/').pop() ?? props.tile.path)

function splitNameExt(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot) } : { base: name, ext: '' }
}

function dirOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx + 1)
}

const title = computed(() => splitNameExt(filename.value).base)

const durationText = computed(() => formatClock(props.tile.duration))

function onClick() {
  urlStore.openTile(props.tile.tilei)
}

function onHoverStart() {
  hovering.value = true
}

function onHoverEnd() {
  hovering.value = false
}

const menuOpen = ref(false)
const menuPos = ref({ x: 0, y: 0 })

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  menuPos.value = { x: e.clientX, y: e.clientY }
  menuOpen.value = true
}

function onMenuOpen() {
  menuOpen.value = false
  onClick()
}

function onMenuOpenRaw() {
  menuOpen.value = false
  window.open(mediaUrl(props.tile.path), '_blank', 'noopener,noreferrer')
}

// Re-prompts (rather than alerting) on both local validation failures and
// backend errors (e.g. a name conflict), so the user can fix the name and
// resubmit, or cancel out entirely, without losing what they typed.
async function onRename() {
  menuOpen.value = false
  const { base, ext } = splitNameExt(filename.value)
  let promptValue = base
  let message = `Enter Filename Without Extension (it stays ${ext})`
  for (;;) {
    const input = window.prompt(message, promptValue)
    if (input === null) return
    const trimmed = input.trim()
    if (!trimmed) {
      promptValue = trimmed
      message = `Name cannot be empty. Enter Filename Without Extension (it stays ${ext})`
      continue
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      promptValue = trimmed
      message = `Name cannot contain "/" or "\\". Enter Filename Without Extension (it stays ${ext})`
      continue
    }
    if (trimmed === base) return // unchanged: silent no-op

    const newName = trimmed + ext
    try {
      await renameMedia(props.tile.path, newName)
      galleryStore.renameTile(props.tile.tilei, dirOf(props.tile.path) + newName)
      return
    } catch (err) {
      promptValue = trimmed
      message = `${(err as Error).message}. Enter Filename Without Extension (it stays ${ext})`
    }
  }
}

async function onDelete() {
  menuOpen.value = false
  if (!window.confirm(`Delete "${filename.value}"?`)) return
  try {
    await deleteMedia(props.tile.path)
    cacheBust.value++
  } catch (err) {
    window.alert((err as Error).message)
  }
}
</script>

<template>
  <div
    class="tile"
    :style="{ width: tile.w + 'px', height: rowH + 'px' }"
    @click="onClick"
    @mouseenter="onHoverStart"
    @mouseleave="onHoverEnd"
    @touchstart.passive="onHoverStart"
    @touchend.passive="onHoverEnd"
    @contextmenu="onContextMenu"
  >
    <template v-if="!playerStore.state.previewsHidden">
      <div v-if="loadFailed" class="load-failed">{{ failedMessage }}</div>
      <template v-else>
        <video
          v-if="isVideoPlaying"
          :src="videoSrc"
          :style="mediaStyle"
          muted
          playsinline
          loop
          autoplay
          @error="onMediaError"
        />
        <img
          v-else-if="source !== 'placeholder'"
          :src="imgSrc"
          :style="mediaStyle"
          :alt="tile.path"
          loading="lazy"
          @error="onMediaError"
        />
        <div v-else class="placeholder" :style="mediaStyle" />
      </template>
      <div v-if="tile.isVid" class="duration-badge">{{ durationText }}</div>
      <div class="title-overlay">{{ title }}</div>
    </template>

    <TileContextMenu
      v-if="menuOpen"
      :x="menuPos.x"
      :y="menuPos.y"
      @click.stop
      @open="onMenuOpen"
      @open-raw="onMenuOpenRaw"
      @rename="onRename"
      @delete="onDelete"
      @close="menuOpen = false"
    />
  </div>
</template>

<style scoped>
.tile {
  position: relative;
  overflow: hidden;
  background: #000;
  cursor: pointer;
}

.tile img,
.tile video,
.tile .placeholder {
  position: absolute;
  object-fit: fill;
}

.placeholder {
  background: #555;
}

.load-failed {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8rem;
  overflow-wrap: break-word;
}

.duration-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 1px 6px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 0.75rem;
  border-radius: 3px;
  pointer-events: none;
}

.title-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px 6px 4px;
  color: #fff;
  font-size: 0.8rem;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
</style>
