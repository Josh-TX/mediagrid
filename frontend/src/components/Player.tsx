import { useEffect, useRef, useState, useCallback } from "react"
import type { MediaInfo } from "@repo/types"
import { fetchMediaInfo, encodePath } from "../api/media"
import styles from "./Player.module.css"

const SWIPE_VELOCITY_THRESHOLD = 0.5 // px/ms
const SWIPE_COMMIT_THRESHOLD = 0.5 // fraction of current item's rendered height
/** Seeking is clamped to this many seconds before the video end. */
const SEEK_END_BUFFER = 0.5

/** Duration of the tap-feedback overlay fade-out animation in ms. */
const OVERLAY_FADE_DURATION_MS = 600
/**
 * Window in ms after a tap during which another tap in the same zone accumulates
 * into the existing overlay rather than starting fresh. After this window expires
 * the accumulated count resets so the next tap starts from the base value.
 */
const OVERLAY_ACCUMULATE_MS = 500

/** Distance (px) from the viewport bottom to the bottom edge of the seek bar wrapper. */
const SEEK_BAR_WRAPPER_BOTTOM = 4
/** Total height (px) of the seek bar wrapper — this is the full touch hit area. */
const SEEK_BAR_WRAPPER_HEIGHT = 32
/** Horizontal padding (px) on each side of the seek bar and title row. */
const SEEK_BAR_PAD = 12
/**
 * Gap (px) between the top of the seek bar wrapper and the bottom of the title row.
 * Determines the title row's fixed bottom offset for both video and image media.
 */
const TITLE_SEEK_GAP = -8

/**
 * The title row sits at this fixed bottom offset regardless of media type.
 * For videos the seek bar appears below it; for images the seek bar is hidden
 * but the title stays in the same position.
 */
const TITLE_ROW_BOTTOM = SEEK_BAR_WRAPPER_BOTTOM + SEEK_BAR_WRAPPER_HEIGHT + TITLE_SEEK_GAP

/** ms the controls hold in contrast mode before fading to subtle. */
const CONTRAST_HOLD_MS = 800
/** ms the controls take to fade from contrast to subtle. */
const CONTRAST_FADE_MS = 800
/** ms for the title/seekbar cross-fade when changing media items. */
const MEDIA_CROSSFADE_MS = 150

interface PlayerProps {
  open: boolean
  initialIndex: number
  shuffleId: number
  onClose: () => void
  onShowToast: (message: string) => void
  onShuffleExpired: () => void
  forwardPreloadCount: number
  backwardPreloadCount: number
  oneFileAtATime: boolean
  playerCropMaxX: number
  playerCropMaxY: number
  rewindSeconds: number
  fastForwardSeconds: number
}

type SlotItem = MediaInfo | null | "loading"

interface Dims {
  width: number
  height: number
  offsetX: number
}

function computeDims(mediaW: number, mediaH: number, vpW: number, vpH: number, cropX: number, cropY: number): Dims {
  const mediaAR = mediaW / mediaH
  const deviceAR = vpW / vpH
  if (mediaAR >= deviceAR) {
    // Landscape: fill height, possibly cropping left/right
    const imgW = vpH * mediaAR
    const maxImgW = cropX >= 0.5 ? Infinity : vpW / (1 - 2 * cropX)
    const imgW_final = Math.min(imgW, maxImgW)
    const imgH_final = imgW_final / mediaAR
    return { width: imgW_final, height: imgH_final, offsetX: (vpW - imgW_final) / 2 }
  } else {
    // Portrait: fill width, possibly cropping top/bottom
    const imgH = vpW / mediaAR
    const maxImgH = cropY >= 0.5 ? Infinity : vpH / (1 - 2 * cropY)
    const imgH_final = Math.min(imgH, maxImgH)
    const imgW_final = imgH_final * mediaAR
    return { width: imgW_final, height: imgH_final, offsetX: (vpW - imgW_final) / 2 }
  }
}

function Spinner() {
  return <div className={styles.spinner} />
}

/** Simple geometric play icon (filled right-pointing triangle). */
function PlayIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="white">
      <polygon points="14,8 40,24 14,40" />
    </svg>
  )
}

/** Simple geometric pause icon (two filled vertical rectangles). */
function PauseIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="white">
      <rect x="11" y="8" width="10" height="32" />
      <rect x="27" y="8" width="10" height="32" />
    </svg>
  )
}

/**
 * Stack layout: items are absolutely positioned.
 * Non-OFOAT: baseY (a persistent ref) is the current item's top in stack space;
 *   the stack wrapper is translateY'd so the current item is viewport-centered.
 * OFOAT: items use explicit visual coordinates; stack wrapper translateY = dragOffset only.
 */
function renderSlot(
  key: number,
  item: SlotItem,
  dims: Dims,
  topOffset: number,
  isCurrent: boolean,
  open: boolean,
  videoRef: React.RefCallback<HTMLVideoElement>,
  ofoatAnimating: boolean,
  onError: () => void,
  hasError: boolean,
  mediaStyle?: React.CSSProperties,
) {
  const className = `${styles.item}${ofoatAnimating ? ` ${styles.itemOfoatAnimating}` : ""}`
  const style: React.CSSProperties = { top: topOffset, width: dims.width, height: dims.height, left: dims.offsetX }
  const mediaClass = mediaStyle ? styles.mediaOfoat : styles.media

  if (item === "loading") {
    return (
      <div key={key} className={className} style={style}>
        <Spinner />
      </div>
    )
  }
  if (item === null) {
    return <div key={key} className={className} style={style} />
  }
  if (item.media_type === 1) {
    return (
      <div key={key} className={className} style={style}>
        <video
          ref={videoRef}
          src={`/media/${encodePath(item.path)}`}
          className={mediaClass}
          style={mediaStyle}
          loop
          playsInline
          autoPlay={isCurrent && open}
          muted={false}
          onError={onError}
          aria-label="Media player"
        />
        {hasError && <div className={styles.loadError}>Failed to load media</div>}
      </div>
    )
  }
  return (
    <div key={key} className={className} style={style}>
      <img src={`/media/${encodePath(item.path)}`} className={mediaClass} style={mediaStyle} alt="" onError={onError} />
      {hasError && <div className={styles.loadError}>Failed to load media</div>}
    </div>
  )
}

async function findLastIndex(shuffleId: number): Promise<number> {
  let hi = 1
  while (true) {
    const res = await fetchMediaInfo(shuffleId, [hi])
    if (res[0] === null) break
    hi *= 2
  }
  let lo = 0
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2)
    const res = await fetchMediaInfo(shuffleId, [mid])
    if (res[0] !== null) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Returns true if the given clientY falls within the seek bar's touch hit area.
 * The wrapper sits SEEK_BAR_WRAPPER_BOTTOM px from the viewport bottom
 * with height SEEK_BAR_WRAPPER_HEIGHT.
 */
function isSeekBarHit(clientY: number, vpH: number): boolean {
  const wrapperBottom = vpH - SEEK_BAR_WRAPPER_BOTTOM
  return clientY >= wrapperBottom - SEEK_BAR_WRAPPER_HEIGHT && clientY <= wrapperBottom
}

/**
 * Converts a clientX position to a seek progress value [0, 1].
 * The left and right SEEK_BAR_PAD zones clamp to 0 and 1 respectively.
 */
function seekProgressFromX(clientX: number, vpW: number): number {
  if (clientX <= SEEK_BAR_PAD) return 0
  if (clientX >= vpW - SEEK_BAR_PAD) return 1
  return (clientX - SEEK_BAR_PAD) / (vpW - SEEK_BAR_PAD * 2)
}

/**
 * Clamps a seek progress value so playback doesn't enter the final SEEK_END_BUFFER seconds.
 */
function clampSeekProgress(progress: number, duration: number): number {
  if (!duration) return progress
  return Math.min((duration - SEEK_END_BUFFER) / duration, Math.max(0, progress))
}

/** Extracts display title from a media path: last path segment with extension stripped. */
function titleFromPath(path: string): string {
  const filename = path.split("/").pop() ?? ""
  return filename.replace(/\.[^.]+$/, "")
}

/** Formats a video's remaining time as "-M:SS". Returns null if duration unknown. */
function formatTimeRemaining(video: HTMLVideoElement): string | null {
  if (!video.duration) return null
  const remaining = Math.max(0, video.duration - video.currentTime)
  const mins = Math.floor(remaining / 60)
  const secs = Math.floor(remaining % 60)
  return `-${mins}:${secs.toString().padStart(2, "0")}`
}

export function Player({
  open,
  initialIndex,
  shuffleId,
  onClose,
  onShowToast,
  onShuffleExpired,
  forwardPreloadCount,
  backwardPreloadCount,
  oneFileAtATime,
  playerCropMaxX,
  playerCropMaxY,
  rewindSeconds,
  fastForwardSeconds,
}: PlayerProps) {
  const effectiveForward = oneFileAtATime ? 1 : forwardPreloadCount
  const effectiveBackward = oneFileAtATime ? 1 : backwardPreloadCount
  const TOTAL_SLOTS = effectiveBackward + 1 + effectiveForward
  const CURRENT_SLOT_IDX = effectiveBackward

  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [slots, setSlots] = useState<SlotItem[]>(() => Array<SlotItem>(TOTAL_SLOTS).fill("loading"))
  const [loadTrigger, setLoadTrigger] = useState(0)
  const [errorIndices, setErrorIndices] = useState<Set<number>>(new Set())

  const [vpW, setVpW] = useState(globalThis.innerWidth ?? 375)
  const [vpH, setVpH] = useState(globalThis.innerHeight ?? 667)

  const [dragOffset, setDragOffset] = useState(0)
  const [animating, setAnimating] = useState(false)
  const animatingRef = useRef(false)

  // OFOAT-specific: item-level absolute tops during commit animation
  const [itemTops, setItemTops] = useState<number[] | null>(null)
  const [ofoatAnimating, setOfoatAnimating] = useState(false)
  // OFOAT-specific: overrides the formula-derived mediaTopInDiv per slot during commit animation,
  // so the within-div alignment transition starts simultaneously with the slot-div slide.
  const [mediaTargetTops, setMediaTargetTops] = useState<number[] | null>(null)

  const baseYRef = useRef(0)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const touchRef = useRef<{
    startY: number
    startX: number
    startTime: number
    lastY: number
    lastX: number
    lastTime: number
    /** 'seek' when touch started in the seek bar hit area; 'swipe' otherwise. */
    mode: "swipe" | "seek"
    /** True after holding/dragging on the seek bar for >200ms: video is paused, seeking freely. */
    pauseDragMode: boolean
  } | null>(null)
  const seekDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { })
    } else {
      document.documentElement.requestFullscreen().catch(() => { })
    }
  }

  // ── Seek bar ─────────────────────────────────────────────────────────────────
  const [seekProgress, setSeekProgress] = useState(0)
  const [fadeSeekBarVisible, setFadeSeekBarVisible] = useState<boolean | null>(null)
  const [fadeTitle, setFadeTitle] = useState<string | null>(null)

  const currentSlot = slots[CURRENT_SLOT_IDX]
  const currentSlotSeekBarVisible = !!currentSlot && currentSlot !== "loading" && currentSlot.media_type === 1
  const currentSlotTitle = currentSlot && currentSlot !== "loading" ? titleFromPath(currentSlot.path) : ""
  const seekBarVisible = fadeSeekBarVisible ?? currentSlotSeekBarVisible

  // Attach timeupdate listener to the current video to drive the seek bar and time remaining.
  // Also depends on currentSlot so it re-attaches after the video element mounts.
  useEffect(() => {
    const video = videoRefs.current.get(currentIndex)
    if (!video) return
    function onTimeUpdate() {
      if (video!.duration) {
        setSeekProgress(video!.currentTime / video!.duration)
        setTimeRemaining(formatTimeRemaining(video!))
      }
    }
    video.addEventListener("timeupdate", onTimeUpdate)
    return () => video.removeEventListener("timeupdate", onTimeUpdate)
  }, [currentIndex, currentSlot])

  // ── Title display ───────────────────────────────────────────────────────────
  const displayedTitle = fadeTitle ?? currentSlotTitle
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null)

  // ── Contrast / subtle visibility mode ───────────────────────────────────────
  /**
   * Two visibility modes for the bottom controls (title row + seek bar):
   *   contrast — black gradient overlay at 15% + controls at 100% opacity
   *   subtle   — overlay fully transparent + controls at 70% opacity
   *
   * The transition from contrast → subtle uses a 1000ms CSS fade triggered after a
   * 1500ms hold. The reverse (subtle → contrast) snaps instantly.
   *
   * During a media transition cross-fade the controls temporarily drop to 0 opacity
   * (150ms out, 150ms in) regardless of mode. This is tracked separately by
   * `mediaFadingOut` and `overlayTransitionMs`.
   */
  const [contrastMode, setContrastMode] = useState(true)
  const [overlayTransitionMs, setOverlayTransitionMs] = useState(0)
  const [mediaFadingOut, setMediaFadingOut] = useState(false)
  const contrastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Tracks whether the current video is paused; paused state holds contrast indefinitely. */
  const isPausedRef = useRef(false)

  // Computed opacities for the two overlay layers
  const controlsOpacity = mediaFadingOut ? 0 : (contrastMode ? 1 : 0.5)
  // Black gradient behind controls: present only in contrast mode
  const blackOverlayOpacity = contrastMode ? 1 : 0

  function cancelContrastTimer() {
    if (contrastTimerRef.current) { clearTimeout(contrastTimerRef.current); contrastTimerRef.current = null }
  }

  /**
   * Snaps to contrast mode (instant) and schedules a fade to subtle after
   * CONTRAST_HOLD_MS, unless the video is currently paused (indefinite contrast).
   */
  function enterContrastMode() {
    cancelContrastTimer()
    setOverlayTransitionMs(0)  // instant snap
    setContrastMode(true)
    if (isPausedRef.current) return
    contrastTimerRef.current = setTimeout(() => {
      // Step 1: set the transition duration
      setOverlayTransitionMs(CONTRAST_FADE_MS)
      // Step 2: change opacity two frames later so the browser sees the new
      // transition-duration before the property value changes (avoids snap).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setContrastMode(false)
        })
      })
    }, CONTRAST_HOLD_MS)
  }

  /**
   * Cross-fades the controls (title + seek bar) out and back in over 2×MEDIA_CROSSFADE_MS,
   * swapping the displayed title/time/seek state at the invisible midpoint.
   * Also enters contrast mode (resets the hold timer).
   */
  function startMediaFade(newTitle: string, newSeekBarVisible: boolean) {
    cancelContrastTimer()
    setOverlayTransitionMs(MEDIA_CROSSFADE_MS)
    setMediaFadingOut(true)

    setTimeout(() => {
      setFadeTitle(newTitle)
      setFadeSeekBarVisible(newSeekBarVisible)
      setTimeRemaining(null)
      setSeekProgress(0)
      setContrastMode(true)
      setMediaFadingOut(false)

      setTimeout(() => {
        setOverlayTransitionMs(0)
        if (!isPausedRef.current) {
          contrastTimerRef.current = setTimeout(() => {
            setOverlayTransitionMs(CONTRAST_FADE_MS)
            requestAnimationFrame(() => requestAnimationFrame(() => setContrastMode(false)))
          }, CONTRAST_HOLD_MS)
        }
      }, MEDIA_CROSSFADE_MS)
    }, MEDIA_CROSSFADE_MS)
  }

  // ── Tap-feedback overlays ─────────────────────────────────────────────────
  const [rewindOverlay, setRewindOverlay] = useState<{ key: number; value: number } | null>(null)
  const [forwardOverlay, setForwardOverlay] = useState<{ key: number; value: number } | null>(null)
  const [playPauseOverlay, setPlayPauseOverlay] = useState<{ key: number; action: "play" | "pause" } | null>(null)

  // Accumulation state lives in refs so timers can read/write without stale closures
  const rewindAccum = useRef({ value: 0, timer: null as ReturnType<typeof setTimeout> | null, key: 0 })
  const forwardAccum = useRef({ value: 0, timer: null as ReturnType<typeof setTimeout> | null, key: 0 })
  const playPauseKey = useRef(0)

  function triggerRewindOverlay() {
    const a = rewindAccum.current
    if (a.timer) clearTimeout(a.timer)
    a.value += rewindSeconds
    a.key++
    setRewindOverlay({ key: a.key, value: a.value })
    a.timer = setTimeout(() => { a.value = 0; a.timer = null }, OVERLAY_ACCUMULATE_MS)
  }

  function triggerForwardOverlay() {
    const a = forwardAccum.current
    if (a.timer) clearTimeout(a.timer)
    a.value += fastForwardSeconds
    a.key++
    setForwardOverlay({ key: a.key, value: a.value })
    a.timer = setTimeout(() => { a.value = 0; a.timer = null }, OVERLAY_ACCUMULATE_MS)
  }

  function triggerPlayPauseOverlay(action: "play" | "pause") {
    playPauseKey.current++
    setPlayPauseOverlay({ key: playPauseKey.current, action })
  }

  // ── Startup: begin the contrast auto-fade timer on mount ────────────────────
  // Player remounts on each open (keyed from Gallery), so this runs once per session.
  useEffect(() => {
    if (!open) return
    const timerId = setTimeout(() => {
      setOverlayTransitionMs(CONTRAST_FADE_MS)
      requestAnimationFrame(() => requestAnimationFrame(() => setContrastMode(false)))
    }, CONTRAST_HOLD_MS)
    contrastTimerRef.current = timerId
    return () => { clearTimeout(timerId); contrastTimerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadWindow = useCallback(
    async (idx: number) => {
      const indices = Array.from({ length: TOTAL_SLOTS }, (_, i) => idx - effectiveBackward + i)
      try {
        const res = await fetchMediaInfo(shuffleId, indices)
        setSlots(res.map((item) => item ?? null))
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) {
          onShuffleExpired()
        }
      }
    },
    [shuffleId, onShuffleExpired, TOTAL_SLOTS, effectiveBackward],
  )

  useEffect(() => {
    if (!open) return
    void loadWindow(currentIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadTrigger, loadWindow])

  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (idx === currentIndex && open) {
        video.play().catch(() => { })
      } else {
        video.pause()
      }
    })
  }, [currentIndex, open])

  const currentItem = currentSlot
  useEffect(() => {
    if (!currentItem || currentItem === "loading") return
    const video = videoRefs.current.get(currentIndex)
    if (video && currentItem.media_type === 1) video.play().catch(() => { })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem])

  useEffect(() => {
    function onResize() {
      setVpW(globalThis.innerWidth)
      setVpH(globalThis.innerHeight)
    }
    globalThis.addEventListener("resize", onResize)
    return () => globalThis.removeEventListener("resize", onResize)
  }, [])

  const fallbackDims: Dims = { width: vpW, height: vpH, offsetX: 0 }
  function getDims(item: SlotItem): Dims {
    if (!item || item === "loading") return fallbackDims
    return computeDims(item.width, item.height, vpW, vpH, playerCropMaxX, playerCropMaxY)
  }

  const allDims = slots.map(getDims) as Dims[]
  // Guard: TOTAL_SLOTS and slots.length can briefly diverge (one render) when preset loads
  // and changes preload counts before the useEffect resets slots. Use slots.length as the
  // authoritative bound to prevent out-of-bounds access into allDims.
  const currDims = allDims[CURRENT_SLOT_IDX] ?? fallbackDims

  // Non-OFOAT: absolute top offsets in stack space (current item at baseYRef)
  const topOffsets = (() => {
    const n = slots.length
    const currIdx = Math.min(CURRENT_SLOT_IDX, n - 1)
    if (n === 0) return [] as number[]
    const offsets = new Array<number>(n)
    offsets[currIdx] = baseYRef.current
    for (let i = currIdx + 1; i < n; i++) {
      offsets[i] = offsets[i - 1]! + allDims[i - 1]!.height
    }
    for (let i = currIdx - 1; i >= 0; i--) {
      offsets[i] = offsets[i + 1]! - allDims[i]!.height
    }
    return offsets
  })()

  // OFOAT resting positions: each slot is one full viewport height
  // prev just above viewport, current filling viewport, next just below
  const restingOfoatTops: number[] | null = oneFileAtATime ? [-vpH, 0, vpH] : null

  // Non-OFOAT: translateY that centers the current item in the viewport
  const restingTranslateY = vpH / 2 - baseYRef.current - currDims.height / 2
  const stackTranslateY = oneFileAtATime ? dragOffset : (restingTranslateY + dragOffset)

  function getItemTop(i: number): number {
    if (oneFileAtATime) {
      // itemTops is set during both snapshot (no CSS transition) and animate (CSS transition) phases
      // ofoatAnimating only controls the CSS class — always use itemTops when present
      if (itemTops) return itemTops[i] ?? 0
      return restingOfoatTops![i] ?? 0
    }
    return topOffsets[i] ?? 0
  }

  async function commitAdvanceOFOAT(direction: 1 | -1) {
    const snapSlots = slots
    const snapAllDims = allDims  // snapshot before any async ops
    const snapRestingTops = restingOfoatTops!
    const snapDragOffset = dragOffset

    const isWrapping = direction === 1
      ? snapSlots[CURRENT_SLOT_IDX + 1] === null
      : snapSlots[CURRENT_SLOT_IDX - 1] === null

    animatingRef.current = true

    // Phase 1: snapshot visual positions, collapse stack translateY (no CSS transition)
    const snapshotTops = snapRestingTops.map((t) => t + snapDragOffset)
    setItemTops(snapshotTops)
    setOfoatAnimating(false)
    setDragOffset(0)
    setAnimating(false)

    // Wait one frame so the browser commits the snapshot positions before we start transitioning
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    // Phase 2: animate slot divs AND within-div media alignment simultaneously (both 300ms).
    // Slot divs: shift by ±vpH. Forward: prev→off, current→prev, next→current.
    // Media alignment targets: pre-compute the post-shift alignment so the transition
    // starts now and finishes exactly when the slot-div slide finishes.
    // After the slot shift we clear mediaTargetTops; the formula gives identical values → no jump.
    const targetTops: number[] = direction === 1 ? [-2 * vpH, -vpH, 0] : [0, vpH, 2 * vpH]

    const c = CURRENT_SLOT_IDX
    const mediaTargets: number[] = direction === 1
      ? [
        0,  // slot[0] flies off screen — value irrelevant
        vpH - (snapAllDims[c]?.height ?? vpH),           // old current → new prev: bottom-aligned
        (vpH - (snapAllDims[c + 1]?.height ?? vpH)) / 2, // old next → new current: centered
      ]
      : [
        (vpH - (snapAllDims[c - 1]?.height ?? vpH)) / 2, // old prev → new current: centered
        0,                                                 // old current → new next: top-aligned
        0,  // slot[2] flies off screen — value irrelevant
      ]

    setItemTops(targetTops)
    setOfoatAnimating(true)
    setMediaTargetTops(mediaTargets)

    await new Promise<void>((r) => setTimeout(r, 300))

    animatingRef.current = false

    if (isWrapping) {
      setOfoatAnimating(false)
      setItemTops(null)
      setDragOffset(0)
      setMediaTargetTops(null)
      setSlots(Array<SlotItem>(TOTAL_SLOTS).fill("loading"))
      if (direction === 1) {
        onShowToast("Wrapped to beginning")
        setCurrentIndex(0)
        setLoadTrigger((t) => t + 1)
      } else {
        onShowToast("Wrapped to end")
        try {
          const last = await findLastIndex(shuffleId)
          setCurrentIndex(last)
          setLoadTrigger((t) => t + 1)
        } catch (err) {
          if (err instanceof Error && err.message.includes("404")) onShuffleExpired()
        }
      }
      return
    }

    const newIndex = currentIndex + direction
    const newSlots: SlotItem[] = direction === 1
      ? [...snapSlots.slice(1), "loading"]
      : ["loading", ...snapSlots.slice(0, -1)]

    // Clear all animation state. Formula-derived mediaTopInDiv values match mediaTargets exactly,
    // so clearing mediaTargetTops causes no visual jump.
    setOfoatAnimating(false)
    setItemTops(null)
    setMediaTargetTops(null)
    setSlots(newSlots)
    setCurrentIndex(newIndex)

    const edgeIdx = direction === 1
      ? newIndex + effectiveForward
      : newIndex - effectiveBackward
    try {
      const res = await fetchMediaInfo(shuffleId, [edgeIdx])
      const edgeItem = res[0] ?? null
      setSlots((prev) =>
        direction === 1
          ? [...prev.slice(0, -1), edgeItem]
          : [edgeItem, ...prev.slice(1)],
      )
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) onShuffleExpired()
    }
  }

  async function commitAdvanceDefault(direction: 1 | -1) {
    const isWrapping = direction === 1
      ? slots[CURRENT_SLOT_IDX + 1] === null
      : slots[CURRENT_SLOT_IDX - 1] === null

    const snapSlots = slots
    const snapAllDims = allDims
    const snapCurrDims = snapAllDims[CURRENT_SLOT_IDX]!
    const snapNeighborDims = (direction === 1
      ? snapAllDims[CURRENT_SLOT_IDX + 1]
      : snapAllDims[CURRENT_SLOT_IDX - 1])!

    const animOffset = direction === 1
      ? -(snapCurrDims.height + snapNeighborDims.height) / 2
      : (snapNeighborDims.height + snapCurrDims.height) / 2

    setDragOffset(animOffset)
    setAnimating(true)
    animatingRef.current = true

    await new Promise<void>((r) => setTimeout(r, 300))

    animatingRef.current = false

    if (isWrapping) {
      baseYRef.current = 0
      setAnimating(false)
      setDragOffset(0)
      setSlots(Array<SlotItem>(TOTAL_SLOTS).fill("loading"))
      if (direction === 1) {
        onShowToast("Wrapped to beginning")
        setCurrentIndex(0)
        setLoadTrigger((t) => t + 1)
      } else {
        onShowToast("Wrapped to end")
        try {
          const last = await findLastIndex(shuffleId)
          setCurrentIndex(last)
          setLoadTrigger((t) => t + 1)
        } catch (err) {
          if (err instanceof Error && err.message.includes("404")) {
            onShuffleExpired()
          }
        }
      }
      return
    }

    const newIndex = currentIndex + direction

    if (direction === 1) {
      baseYRef.current += snapCurrDims.height
    } else {
      baseYRef.current -= snapNeighborDims.height
    }

    const newSlots: SlotItem[] = direction === 1
      ? [...snapSlots.slice(1), "loading"]
      : ["loading", ...snapSlots.slice(0, -1)]

    setAnimating(false)
    setDragOffset(0)
    setSlots(newSlots)
    setCurrentIndex(newIndex)

    const edgeIdx = direction === 1
      ? newIndex + effectiveForward
      : newIndex - effectiveBackward
    try {
      const res = await fetchMediaInfo(shuffleId, [edgeIdx])
      const edgeItem = res[0] ?? null
      setSlots((prev) =>
        direction === 1
          ? [...prev.slice(0, -1), edgeItem]
          : [edgeItem, ...prev.slice(1)],
      )
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) {
        onShuffleExpired()
      }
    }
  }

  async function commitAdvance(direction: 1 | -1) {
    if (oneFileAtATime) {
      await commitAdvanceOFOAT(direction)
    } else {
      await commitAdvanceDefault(direction)
    }
  }

  function snapBack() {
    setAnimating(true)
    animatingRef.current = true
    setDragOffset(0)
    setTimeout(() => {
      setAnimating(false)
      animatingRef.current = false
    }, 300)
  }

  // ── Touch handlers ───────────────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    if (animatingRef.current) return
    const t = e.touches[0]
    if (!t) return
    const mode = isSeekBarHit(t.clientY, vpH) ? "seek" : "swipe"
    touchRef.current = {
      startY: t.clientY,
      startX: t.clientX,
      startTime: performance.now(),
      lastY: t.clientY,
      lastX: t.clientX,
      lastTime: performance.now(),
      mode,
      pauseDragMode: false,
    }
    if (mode === "seek") {
      enterContrastMode()
      // After 200ms of holding/dragging on the seek bar, enter pauseDragMode:
      // pause the video and jump to the held position.
      const capturedVpW = vpW
      const capturedIdx = currentIndex
      seekDragTimerRef.current = setTimeout(() => {
        if (!touchRef.current || touchRef.current.mode !== "seek") return
        touchRef.current.pauseDragMode = true
        const video = videoRefs.current.get(capturedIdx)
        if (video && video.duration) {
          video.pause()
          const progress = clampSeekProgress(seekProgressFromX(touchRef.current.lastX, capturedVpW), video.duration)
          video.currentTime = progress * video.duration
          setSeekProgress(progress)
        }
      }, 200)
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!touchRef.current || animatingRef.current) return
    const t = e.touches[0]
    if (!t) return

    const now = performance.now()
    const prevLastY = touchRef.current.lastY
    const prevLastTime = touchRef.current.lastTime
    touchRef.current.lastY = t.clientY
    touchRef.current.lastX = t.clientX
    touchRef.current.lastTime = now

    if (touchRef.current.mode === "swipe") {
      setDragOffset(t.clientY - touchRef.current.startY)
      return
    }

    // pauseDragMode: seek freely, no swipe handoff, video is already paused
    if (touchRef.current.pauseDragMode) {
      const video = videoRefs.current.get(currentIndex)
      if (video && video.duration) {
        const progress = clampSeekProgress(seekProgressFromX(t.clientX, vpW), video.duration)
        video.currentTime = progress * video.duration
        setSeekProgress(progress)
      }
      return
    }

    // Seek mode: fast vertical velocity hands off to swipe
    const dy = t.clientY - prevLastY
    const dt = Math.max(now - prevLastTime, 1)
    const vy = Math.abs(dy) / dt
    if (vy > SWIPE_VELOCITY_THRESHOLD) {
      if (seekDragTimerRef.current) { clearTimeout(seekDragTimerRef.current); seekDragTimerRef.current = null }
      touchRef.current.mode = "swipe"
      setDragOffset(t.clientY - touchRef.current.startY)
      return
    }

    // Pre-pauseDragMode scrub: update currentTime continuously based on horizontal position
    const video = videoRefs.current.get(currentIndex)
    if (video && video.duration) {
      const progress = clampSeekProgress(seekProgressFromX(t.clientX, vpW), video.duration)
      video.currentTime = progress * video.duration
      setSeekProgress(progress)
    }
  }

  function onTouchEnd() {
    if (!touchRef.current || animatingRef.current) return
    const { startY, startTime, lastY, lastX, lastTime, mode, pauseDragMode } = touchRef.current
    touchRef.current = null

    if (seekDragTimerRef.current) { clearTimeout(seekDragTimerRef.current); seekDragTimerRef.current = null }

    if (mode === "seek") {
      if (pauseDragMode) {
        // Resume playback silently (no overlay); entering contrast via the seek start trigger
        const video = videoRefs.current.get(currentIndex)
        if (video) {
          video.play().catch(() => { })
          isPausedRef.current = false
        }
        return
      }
      // Finalize seek position (handles pure taps where onTouchMove may not have fired)
      const video = videoRefs.current.get(currentIndex)
      if (video && video.duration) {
        const progress = clampSeekProgress(seekProgressFromX(lastX, vpW), video.duration)
        video.currentTime = progress * video.duration
        setSeekProgress(progress)
      }
      return
    }

    // Swipe commit logic
    const dy = lastY - startY
    const dt = Math.max(lastTime - startTime, 1)
    const velocity = Math.abs(dy) / dt
    const commitByVelocity = velocity > SWIPE_VELOCITY_THRESHOLD
    const commitByDistance = Math.abs(dy) > SWIPE_COMMIT_THRESHOLD * currDims.height

    if (commitByDistance || commitByVelocity) {
      const direction = dy < 0 ? 1 : -1
      const targetSlot = slots[CURRENT_SLOT_IDX + direction]

      // Cross-fade controls to swap title/time/seek state during the animation
      const newTitle = targetSlot && targetSlot !== "loading" ? titleFromPath(targetSlot.path) : ""
      const newSeekBarVisible = !!(targetSlot && targetSlot !== "loading" && targetSlot.media_type === 1)
      startMediaFade(newTitle, newSeekBarVisible)

      void commitAdvance(direction)
    } else {
      snapBack()
    }
  }

  // ── Tap zone click handler ───────────────────────────────────────────────────
  function onPlayerClick(e: React.MouseEvent) {
    // Seek bar taps are handled by touch events
    if (isSeekBarHit(e.clientY, vpH)) return

    const currentMedia = slots[CURRENT_SLOT_IDX]
    const isVideo = !!currentMedia && currentMedia !== "loading" && currentMedia.media_type === 1
    const video = isVideo ? videoRefs.current.get(currentIndex) : undefined
    const x = e.clientX

    if (isVideo && x < vpW * 0.25) {
      // Left 25%: rewind
      if (video) {
        video.currentTime = Math.max(0, video.currentTime - rewindSeconds)
        triggerRewindOverlay()
      }
      enterContrastMode()
      return
    }

    if (isVideo && x > vpW * 0.75) {
      // Right 25%: fast-forward, clamped to SEEK_END_BUFFER before end
      if (video) {
        const maxTime = Math.max(0, (video.duration || 0) - SEEK_END_BUFFER)
        video.currentTime = Math.min(maxTime, video.currentTime + fastForwardSeconds)
        triggerForwardOverlay()
      }
      enterContrastMode()
      return
    }

    if (isVideo) {
      // Middle 50%: play/pause
      if (video) {
        if (video.paused) {
          video.play().catch(() => { })
          triggerPlayPauseOverlay("play")
          isPausedRef.current = false
          enterContrastMode()
        } else {
          video.pause()
          triggerPlayPauseOverlay("pause")
          isPausedRef.current = true
          // Paused: hold contrast indefinitely (cancel any fade-to-subtle timer)
          cancelContrastTimer()
          setOverlayTransitionMs(0)
          setContrastMode(true)
        }
      }
      return
    }

    // Non-action tap (image, or non-zone area): toggle contrast/subtle.
    // Contrast → subtle is an instant snap (spec: "immediately snaps to subtle").
    // Subtle → contrast uses the normal enterContrastMode path (instant + hold timer).
    if (contrastMode) {
      cancelContrastTimer()
      setOverlayTransitionMs(0)
      setContrastMode(false)
    } else {
      enterContrastMode()
    }
  }

  function getVideoRef(mediaIdx: number): React.RefCallback<HTMLVideoElement> {
    return (el) => {
      if (el) videoRefs.current.set(mediaIdx, el)
      else videoRefs.current.delete(mediaIdx)
    }
  }

  // ── Seek bar gradient style ──────────────────────────────────────────────────
  const seekBarStyle: React.CSSProperties = {
    background: `linear-gradient(to right, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.8) ${seekProgress * 100}%, rgba(255,255,255,0.3) ${seekProgress * 100}%, rgba(255,255,255,0.3) 100%)`,
  }

  // ── Shared transition style for controls and overlay ─────────────────────────
  const overlayTransition = `opacity ${overlayTransitionMs}ms ease`

  return (
    <div
      className={`${styles.player} ${open ? styles.playerOpen : ""}`}
      onClick={onPlayerClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className={`${styles.stack} ${animating ? styles.animating : ""}`}
        style={{ transform: `translateY(${stackTranslateY}px)` }}
      >
        {slots.map((item, i) => {
          const mediaIdx = currentIndex + (i - CURRENT_SLOT_IDX)
          let slotDims: Dims
          let mediaStyle: React.CSSProperties | undefined
          if (oneFileAtATime) {
            // Slot div is full-viewport; media is absolutely positioned inside using crop dims.
            // Vertical alignment per slot: prev=bottom-aligned, current=centered, next=top-aligned.
            // This positions each media's visible edge flush with the viewport edge at rest,
            // creating a natural peek as the user drags. Transition fires only after slot shift
            // (slot indices don't change during drag, so no unwanted transition during drag).
            slotDims = { width: vpW, height: vpH, offsetX: 0 }
            const mDims = allDims[i] ?? fallbackDims
            const restingMediaTop = i === 0
              ? vpH - mDims.height                // prev: bottom edge at div bottom (= viewport top at rest)
              : i === CURRENT_SLOT_IDX
                ? (vpH - mDims.height) / 2          // current: centered
                : 0                                 // next: top edge at div top (= viewport bottom at rest)
            // During commit animation, use pre-computed targets so alignment transitions
            // start simultaneously with the slot-div slide (not after it completes).
            const mediaTopInDiv = mediaTargetTops?.[i] ?? restingMediaTop
            mediaStyle = {
              position: "absolute",
              width: mDims.width,
              height: mDims.height,
              left: mDims.offsetX,
              top: mediaTopInDiv,
              transition: mediaTargetTops ? "top 0.3s ease" : undefined,
            }
          } else {
            slotDims = allDims[i] ?? fallbackDims
          }
          const onError = () => setErrorIndices((prev) => new Set(prev).add(mediaIdx))
          return renderSlot(
            mediaIdx,
            item,
            slotDims,
            getItemTop(i),
            i === CURRENT_SLOT_IDX,
            open,
            getVideoRef(mediaIdx),
            ofoatAnimating,
            onError,
            errorIndices.has(mediaIdx),
            mediaStyle,
          )
        })}
      </div>

      {/* Bottom gradient overlay — provides contrast behind title and seek bar.
          Only visible in contrast mode; fades with the same transition as controls. */}
      <div
        className={styles.bottomOverlay}
        style={{ opacity: blackOverlayOpacity, transition: overlayTransition }}
      />

      {/* Title row — always present (images and videos), fixed position above seek bar.
          Left: media title (truncated). Right: time remaining (videos only). */}
      <div
        className={styles.titleRow}
        style={{ opacity: controlsOpacity, transition: overlayTransition, bottom: TITLE_ROW_BOTTOM }}
      >
        <span className={styles.titleText}>{displayedTitle}</span>
        {seekBarVisible && timeRemaining && (
          <span className={styles.timeRemaining}>{timeRemaining}</span>
        )}
      </div>

      {/* Seek bar — videos only; hidden for images by conditional render */}
      {seekBarVisible && (
        <div
          className={styles.seekBarWrapper}
          style={{ opacity: controlsOpacity, transition: overlayTransition }}
        >
          <div
            className={styles.seekBar}
            style={seekBarStyle}
          />
        </div>
      )}

      {/* Tap-feedback overlays — one per zone, independent animation keys */}
      {rewindOverlay && (
        <div
          key={`rw-${rewindOverlay.key}`}
          className={styles.overlay}
          style={{ left: 0, width: "25%", animationDuration: `${OVERLAY_FADE_DURATION_MS}ms` }}
        >
          <span className={styles.overlayText}>−{rewindOverlay.value}s</span>
        </div>
      )}
      {playPauseOverlay && (
        <div
          key={`pp-${playPauseOverlay.key}`}
          className={styles.overlay}
          style={{ left: "25%", width: "50%", animationDuration: `${OVERLAY_FADE_DURATION_MS}ms` }}
        >
          {playPauseOverlay.action === "play" ? <PlayIcon /> : <PauseIcon />}
        </div>
      )}
      {forwardOverlay && (
        <div
          key={`fw-${forwardOverlay.key}`}
          className={styles.overlay}
          style={{ left: "75%", width: "25%", animationDuration: `${OVERLAY_FADE_DURATION_MS}ms` }}
        >
          <span className={styles.overlayText}>+{forwardOverlay.value}s</span>
        </div>
      )}

      {/* Back button — 8px from top/left, slightly transparent */}
      <button className={styles.backBtn} onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="Back">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
      </button>

      {/* Fullscreen toggle — 8px from top/right; shows ⛶ normally, × in fullscreen */}
      <button className={styles.fullscreenBtn} onClick={(e) => { e.stopPropagation(); toggleFullscreen() }} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
        {isFullscreen
          ? <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          : <span className={styles.fullscreenIcon}>⛶</span>
        }
      </button>
    </div>
  )
}
