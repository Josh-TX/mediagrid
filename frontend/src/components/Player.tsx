import { useEffect, useRef, useState, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { fetchMediaInfo, encodePath } from "../api/media"
import { useFullscreen, useViewportSize, useTapOverlays, useSeekBar, type SlotItem } from "./playerHooks"
import { PlayerControls, Spinner } from "./PlayerControls"
import styles from "./Player.module.css"

const SWIPE_VELOCITY_THRESHOLD = 0.5 // px/ms
const SWIPE_COMMIT_THRESHOLD = 0.5 // fraction of current item's rendered height
const SEEK_END_BUFFER = 0.5

const SEEK_BAR_WRAPPER_BOTTOM = 0
const SEEK_BAR_WRAPPER_HEIGHT = 42
const SEEK_BAR_PAD = 12
const CONTRAST_HOLD_MS = 800
const CONTRAST_FADE_MS = 800
const MEDIA_CROSSFADE_MS = 100

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
  rewindAmount: number
  fastForwardAmount: number
  isRewindPercent: boolean
  isForwardPercent: boolean
  videoEndBehavior: "loop" | "stop" | "next"
}

interface Dims {
  width: number
  height: number
  offsetX: number
}

function computeDims(mediaW: number, mediaH: number, vpW: number, vpH: number, cropX: number, cropY: number): Dims {
  const mediaAR = mediaW / mediaH
  const deviceAR = vpW / vpH
  if (mediaAR >= deviceAR) {
    const imgW = vpH * mediaAR
    const maxImgW = cropX >= 0.5 ? Infinity : vpW / (1 - 2 * cropX)
    const imgW_final = Math.min(imgW, maxImgW)
    const imgH_final = imgW_final / mediaAR
    return { width: imgW_final, height: imgH_final, offsetX: (vpW - imgW_final) / 2 }
  } else {
    const imgH = vpW / mediaAR
    const maxImgH = cropY >= 0.5 ? Infinity : vpH / (1 - 2 * cropY)
    const imgH_final = Math.min(imgH, maxImgH)
    const imgW_final = imgH_final * mediaAR
    return { width: imgW_final, height: imgH_final, offsetX: (vpW - imgW_final) / 2 }
  }
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
  mediaStyle: React.CSSProperties | undefined,
  isPausedRef: React.RefObject<boolean>,
  onEnded?: () => void,
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
          playsInline
          autoPlay={isCurrent && open}
          muted={false}
          onError={onError}
          onCanPlay={isCurrent && open ? (e) => { if (!isPausedRef.current) e.currentTarget.play().catch(() => { }) } : undefined}
          onEnded={isCurrent ? onEnded : undefined}
          aria-label="Media player"
        >
          <track kind="captions" />
        </video>
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

function isSeekBarHit(clientY: number, vpH: number): boolean {
  const wrapperBottom = vpH - SEEK_BAR_WRAPPER_BOTTOM
  return clientY >= wrapperBottom - SEEK_BAR_WRAPPER_HEIGHT && clientY <= wrapperBottom
}

function seekProgressFromX(clientX: number, vpW: number): number {
  if (clientX <= SEEK_BAR_PAD) return 0
  if (clientX >= vpW - SEEK_BAR_PAD) return 1
  return (clientX - SEEK_BAR_PAD) / (vpW - SEEK_BAR_PAD * 2)
}

function clampSeekProgress(progress: number, duration: number): number {
  if (!duration) return progress
  return Math.min((duration - SEEK_END_BUFFER) / duration, Math.max(0, progress))
}

function titleFromPath(path: string): string {
  const filename = path.split("/").pop() ?? ""
  return filename.replace(/\.[^.]+$/, "")
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
  rewindAmount,
  fastForwardAmount,
  isRewindPercent,
  isForwardPercent,
  videoEndBehavior,
}: PlayerProps) {
  const effectiveForward = oneFileAtATime ? 1 : forwardPreloadCount
  const effectiveBackward = oneFileAtATime ? 1 : backwardPreloadCount
  const TOTAL_SLOTS = effectiveBackward + 1 + effectiveForward
  const CURRENT_SLOT_IDX = effectiveBackward

  const queryClient = useQueryClient()

  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [slots, setSlots] = useState<SlotItem[]>(() => Array<SlotItem>(TOTAL_SLOTS).fill("loading"))
  const slotsRef = useRef<SlotItem[]>(slots)
  slotsRef.current = slots
  const [errorIndices, setErrorIndices] = useState<Set<number>>(new Set())

  // isOpen lags one frame behind mount so the browser paints translateX(100%)
  // before the CSS transition fires. Close is adjusted during render for instant slide-out.
  const [isOpen, setIsOpen] = useState(false)
  if (!open && isOpen) setIsOpen(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const { vpW, vpH } = useViewportSize()

  const [dragOffset, setDragOffset] = useState(0)
  const [animating, setAnimating] = useState(false)
  const animatingRef = useRef(false)

  // OFOAT-specific: item-level absolute tops during commit animation
  const [itemTops, setItemTops] = useState<number[] | null>(null)
  const [ofoatAnimating, setOfoatAnimating] = useState(false)
  // OFOAT-specific: overrides the formula-derived mediaTopInDiv per slot during commit animation,
  // so the within-div alignment transition starts simultaneously with the slot-div slide.
  const [mediaTargetTops, setMediaTargetTops] = useState<number[] | null>(null)

  const onShuffleExpiredRef = useRef(onShuffleExpired)
  onShuffleExpiredRef.current = onShuffleExpired

  const baseYRef = useRef(0)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const touchRef = useRef<{
    startY: number
    startX: number
    startTime: number
    lastY: number
    lastX: number
    lastTime: number
    mode: "swipe" | "seek"
    pauseDragMode: boolean
    wasPlaying: boolean
  } | null>(null)
  const pendingTouchRef = useRef<{
    startY: number
    startTime: number
    lastY: number
    lastTime: number
  } | null>(null)
  const animStartTimeRef = useRef<number>(0)
  const queuedCommitRef = useRef<{ direction: 1 | -1 } | null>(null)
  const seekDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const preventNextClickRef = useRef(false)

  // ── Fullscreen ──────────────────────────────────────────────────────────────
  const { isFullscreen, toggleFullscreen } = useFullscreen()

  // ── Seek bar ─────────────────────────────────────────────────────────────────
  const [fadeSeekBarVisible, setFadeSeekBarVisible] = useState<boolean | null>(null)
  const [fadeTitle, setFadeTitle] = useState<string | null>(null)

  const currentSlot = slots[CURRENT_SLOT_IDX]
  const currentSlotSeekBarVisible = !!currentSlot && currentSlot !== "loading" && currentSlot.media_type === 1
  const currentSlotTitle = currentSlot && currentSlot !== "loading" ? titleFromPath(currentSlot.path) : ""
  const seekBarVisible = fadeSeekBarVisible ?? currentSlotSeekBarVisible

  const { seekProgress, setSeekProgress, timeRemaining, setTimeRemaining } = useSeekBar(currentIndex, currentSlot, videoRefs)

  // ── Title display ───────────────────────────────────────────────────────────
  const displayedTitle = fadeTitle ?? currentSlotTitle

  const [infoTooltipOpen, setInfoTooltipOpen] = useState(false)

  useEffect(() => { setInfoTooltipOpen(false) }, [currentIndex])

  // ── Contrast / subtle visibility mode ───────────────────────────────────────
  const [contrast, setContrast] = useState({ mode: true, transitionMs: 0 })
  const [mediaFadingOut, setMediaFadingOut] = useState(false)
  const contrastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPausedRef = useRef(false)

  const [seekBarSubtle, setSeekBarSubtle] = useState(true)

  const controlsOpacity = mediaFadingOut ? 0 : (contrast.mode ? 1 : 0.5)
  const seekBarOpacity = mediaFadingOut ? 0 : (seekBarSubtle ? 0.5 : (contrast.mode ? 1 : 0.5))
  const blackOverlayOpacity = contrast.mode ? 1 : 0

  function cancelContrastTimer() {
    if (contrastTimerRef.current) { clearTimeout(contrastTimerRef.current); contrastTimerRef.current = null }
  }

  function enterContrastMode() {
    cancelContrastTimer()
    setSeekBarSubtle(false)
    setContrast({ mode: true, transitionMs: 0 })
    if (isPausedRef.current) return
    contrastTimerRef.current = setTimeout(() => {
      setContrast(prev => ({ ...prev, transitionMs: CONTRAST_FADE_MS }))
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setContrast(prev => ({ ...prev, mode: false }))
        })
      })
    }, CONTRAST_HOLD_MS)
  }

  function startMediaFade(newTitle: string, newSeekBarVisible: boolean) {
    cancelContrastTimer()
    isPausedRef.current = false
    setContrast(prev => ({ ...prev, transitionMs: MEDIA_CROSSFADE_MS }))
    setMediaFadingOut(true)

    setTimeout(() => {
      setFadeTitle(newTitle)
      setFadeSeekBarVisible(newSeekBarVisible)
      setTimeRemaining(null)
      setSeekProgress(0)
      setSeekBarSubtle(newSeekBarVisible)
      setContrast(prev => ({ ...prev, mode: true }))
      setMediaFadingOut(false)

      setTimeout(() => {
        setContrast(prev => ({ ...prev, transitionMs: 0 }))
        if (!isPausedRef.current) {
          contrastTimerRef.current = setTimeout(() => {
            setContrast(prev => ({ ...prev, transitionMs: CONTRAST_FADE_MS }))
            requestAnimationFrame(() => requestAnimationFrame(() => setContrast(prev => ({ ...prev, mode: false }))))
          }, CONTRAST_HOLD_MS)
        }
      }, MEDIA_CROSSFADE_MS)
    }, MEDIA_CROSSFADE_MS)
  }

  // ── Tap-feedback overlays ─────────────────────────────────────────────────
  const { rewindOverlay, forwardOverlay, playPauseOverlay, triggerRewindOverlay, triggerForwardOverlay, triggerPlayPauseOverlay } = useTapOverlays(rewindAmount, isRewindPercent, fastForwardAmount, isForwardPercent)

  // ── Startup: begin the contrast auto-fade timer on mount ────────────────────
  useEffect(() => {
    const timerId = setTimeout(() => {
      setContrast(prev => ({ ...prev, transitionMs: CONTRAST_FADE_MS }))
      requestAnimationFrame(() => requestAnimationFrame(() => setContrast(prev => ({ ...prev, mode: false }))))
    }, CONTRAST_HOLD_MS)
    contrastTimerRef.current = timerId
    return () => { clearTimeout(timerId); contrastTimerRef.current = null }
  }, [])

  const loadWindow = useCallback(
    async (idx: number) => {
      const indices = Array.from({ length: TOTAL_SLOTS }, (_, i) => idx - effectiveBackward + i)
      try {
        const res = await queryClient.fetchQuery({
          queryKey: ['media-info', shuffleId, indices],
          queryFn: () => fetchMediaInfo(shuffleId, indices),
          staleTime: 60_000,
        })
        setSlots(res.map((item) => item ?? null))
      } catch (err) {
        console.error("[Player] loadWindow error", err)
        if (err instanceof Error && err.message.includes("404")) onShuffleExpiredRef.current()
      }
    },
    [shuffleId, TOTAL_SLOTS, effectiveBackward, queryClient],
  )

  useEffect(() => {
    if (!open) return
    void loadWindow(initialIndex)
  }, [loadWindow, initialIndex, open])

  // Keep the i= param in sync as the user swipes through media.
  useEffect(() => {
    if (!open) return
    const params = new URLSearchParams(window.location.search)
    params.set("i", String(currentIndex))
    const qs = params.toString()
    history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname)
  }, [currentIndex, open])

  useEffect(() => {
    if (open) return
    const timer = setTimeout(() => {
      videoRefs.current.forEach((v) => v.pause())
      setSlots((prev) => prev.map(() => null))
    }, 300)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (idx === currentIndex && open) video.play().catch(() => { })
      else video.pause()
    })
  }, [currentIndex, open])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!queuedCommitRef.current) return
    if (animatingRef.current) return
    const { direction } = queuedCommitRef.current
    const targetSlot = slots[CURRENT_SLOT_IDX + direction]
    if (!targetSlot || targetSlot === "loading") return
    queuedCommitRef.current = null
    const newTitle = titleFromPath(targetSlot.path)
    const newSeekBarVisible = targetSlot.media_type === 1
    startMediaFade(newTitle, newSeekBarVisible)
    void commitAdvance(direction)
  }, [currentIndex, slots])

  const fallbackDims: Dims = { width: vpW, height: vpH, offsetX: 0 }
  function getDims(item: SlotItem): Dims {
    if (!item || item === "loading") return fallbackDims
    return computeDims(item.width, item.height, vpW, vpH, playerCropMaxX, playerCropMaxY)
  }

  const allDims = slots.map(getDims) as Dims[]
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

  const restingOfoatTops: number[] | null = oneFileAtATime ? [-vpH, 0, vpH] : null
  const restingTranslateY = vpH / 2 - baseYRef.current - currDims.height / 2
  const stackTranslateY = oneFileAtATime ? dragOffset : (restingTranslateY + dragOffset)

  function getItemTop(i: number): number {
    if (oneFileAtATime) {
      if (itemTops) return itemTops[i] ?? 0
      return restingOfoatTops![i] ?? 0
    }
    return topOffsets[i] ?? 0
  }

  async function commitAdvanceOFOAT(direction: 1 | -1) {
    const snapSlots = slotsRef.current
    const snapAllDims = allDims
    const snapRestingTops = restingOfoatTops!
    const snapDragOffset = dragOffset

    const isWrapping = direction === 1
      ? snapSlots[CURRENT_SLOT_IDX + 1] === null
      : snapSlots[CURRENT_SLOT_IDX - 1] === null

    animatingRef.current = true
    animStartTimeRef.current = performance.now()

    // Phase 1: snapshot visual positions, collapse stack translateY (no CSS transition)
    const snapshotTops = snapRestingTops.map((t) => t + snapDragOffset)
    setItemTops(snapshotTops)
    setOfoatAnimating(false)
    setDragOffset(0)
    setAnimating(false)

    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    // Phase 2: animate slot divs AND within-div media alignment simultaneously (both 200ms).
    const targetTops: number[] = direction === 1 ? [-2 * vpH, -vpH, 0] : [0, vpH, 2 * vpH]

    const c = CURRENT_SLOT_IDX
    const mediaTargets: number[] = direction === 1
      ? [
        0,
        vpH - (snapAllDims[c]?.height ?? vpH),
        (vpH - (snapAllDims[c + 1]?.height ?? vpH)) / 2,
      ]
      : [
        (vpH - (snapAllDims[c - 1]?.height ?? vpH)) / 2,
        0,
        0,
      ]

    setItemTops(targetTops)
    setOfoatAnimating(true)
    setMediaTargetTops(mediaTargets)

    await new Promise<void>((r) => setTimeout(r, 100))
    const incomingVideoOfoat = videoRefs.current.get(currentIndex + direction)
    if (incomingVideoOfoat) {
      incomingVideoOfoat.play().catch(() => { })
      if (incomingVideoOfoat.duration) setSeekProgress(incomingVideoOfoat.currentTime / incomingVideoOfoat.duration)
    }
    await new Promise<void>((r) => setTimeout(r, 100))

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
        void loadWindow(0)
      } else {
        onShowToast("Wrapped to end")
        try {
          const last = await findLastIndex(shuffleId)
          setCurrentIndex(last)
          void loadWindow(last)
        } catch (err) {
          if (err instanceof Error && err.message.includes("404")) onShuffleExpired()
        }
      }
      return
    }

    const newIndex = currentIndex + direction

    setOfoatAnimating(false)
    setItemTops(null)
    setMediaTargetTops(null)
    setSlots(prev => direction === 1 ? [...prev.slice(1), "loading"] : ["loading", ...prev.slice(0, -1)])
    setCurrentIndex(newIndex)

    const edgeIdx = direction === 1 ? newIndex + effectiveForward : newIndex - effectiveBackward
    try {
      const res = await queryClient.fetchQuery({
        queryKey: ['media-info', shuffleId, [edgeIdx]],
        queryFn: () => fetchMediaInfo(shuffleId, [edgeIdx]),
        staleTime: 60_000,
      })
      const edgeItem = res[0] ?? null
      setSlots((prev) =>
        direction === 1 ? [...prev.slice(0, -1), edgeItem] : [edgeItem, ...prev.slice(1)],
      )
    } catch (err) {
      console.error("[Player] OFOAT edge fetch error", err)
      if (err instanceof Error && err.message.includes("404")) onShuffleExpired()
    }
  }

  async function commitAdvanceDefault(direction: 1 | -1) {
    const isWrapping = direction === 1
      ? slots[CURRENT_SLOT_IDX + 1] === null
      : slots[CURRENT_SLOT_IDX - 1] === null

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
    animStartTimeRef.current = performance.now()

    await new Promise<void>((r) => setTimeout(r, 100))
    const incomingVideo = videoRefs.current.get(currentIndex + direction)
    if (incomingVideo) {
      incomingVideo.play().catch(() => { })
      if (incomingVideo.duration) setSeekProgress(incomingVideo.currentTime / incomingVideo.duration)
    }
    await new Promise<void>((r) => setTimeout(r, 100))

    animatingRef.current = false

    if (isWrapping) {
      baseYRef.current = 0
      setAnimating(false)
      setDragOffset(0)
      setSlots(Array<SlotItem>(TOTAL_SLOTS).fill("loading"))
      if (direction === 1) {
        onShowToast("Wrapped to beginning")
        setCurrentIndex(0)
        void loadWindow(0)
      } else {
        onShowToast("Wrapped to end")
        try {
          const last = await findLastIndex(shuffleId)
          setCurrentIndex(last)
          void loadWindow(last)
        } catch (err) {
          if (err instanceof Error && err.message.includes("404")) onShuffleExpired()
        }
      }
      return
    }

    const newIndex = currentIndex + direction

    if (direction === 1) baseYRef.current += snapCurrDims.height
    else baseYRef.current -= snapNeighborDims.height

    setAnimating(false)
    setDragOffset(0)
    setSlots(prev => direction === 1 ? [...prev.slice(1), "loading"] : ["loading", ...prev.slice(0, -1)])
    setCurrentIndex(newIndex)

    const edgeIdx = direction === 1 ? newIndex + effectiveForward : newIndex - effectiveBackward
    try {
      const res = await queryClient.fetchQuery({
        queryKey: ['media-info', shuffleId, [edgeIdx]],
        queryFn: () => fetchMediaInfo(shuffleId, [edgeIdx]),
        staleTime: 60_000,
      })
      const edgeItem = res[0] ?? null
      setSlots((prev) =>
        direction === 1 ? [...prev.slice(0, -1), edgeItem] : [edgeItem, ...prev.slice(1)],
      )
    } catch (err) {
      console.error("[Player] default edge fetch error", err)
      if (err instanceof Error && err.message.includes("404")) onShuffleExpired()
    }
  }

  async function commitAdvance(direction: 1 | -1) {
    if (oneFileAtATime) await commitAdvanceOFOAT(direction)
    else await commitAdvanceDefault(direction)
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
    if (animatingRef.current) {
      const t = e.touches[0]
      if (!t) return
      pendingTouchRef.current = { startY: t.clientY, startTime: performance.now(), lastY: t.clientY, lastTime: performance.now() }
      return
    }
    const t = e.touches[0]
    if (!t) return
    const mode = isSeekBarHit(t.clientY, vpH) ? "seek" : "swipe"
    const currentVideo = videoRefs.current.get(currentIndex)
    touchRef.current = {
      startY: t.clientY, startX: t.clientX, startTime: performance.now(),
      lastY: t.clientY, lastX: t.clientX, lastTime: performance.now(),
      mode, pauseDragMode: false, wasPlaying: !!currentVideo && !currentVideo.paused,
    }
    if (mode === "seek") {
      enterContrastMode()
      const capturedVpW = vpW
      const capturedIdx = currentIndex
      seekDragTimerRef.current = setTimeout(() => {
        if (!touchRef.current || touchRef.current.mode !== "seek") return
        touchRef.current.pauseDragMode = true
        cancelContrastTimer()
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
    if (pendingTouchRef.current) {
      const t = e.touches[0]
      if (t) { pendingTouchRef.current.lastY = t.clientY; pendingTouchRef.current.lastTime = performance.now() }
      return
    }
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

    if (touchRef.current.pauseDragMode) {
      const video = videoRefs.current.get(currentIndex)
      if (video && video.duration) {
        const progress = clampSeekProgress(seekProgressFromX(t.clientX, vpW), video.duration)
        video.currentTime = progress * video.duration
        setSeekProgress(progress)
      }
      return
    }

    const dy = t.clientY - prevLastY
    const dt = Math.max(now - prevLastTime, 1)
    const vy = Math.abs(dy) / dt
    if (vy > SWIPE_VELOCITY_THRESHOLD) {
      if (seekDragTimerRef.current) { clearTimeout(seekDragTimerRef.current); seekDragTimerRef.current = null }
      touchRef.current.mode = "swipe"
      setDragOffset(t.clientY - touchRef.current.startY)
      return
    }

    const video = videoRefs.current.get(currentIndex)
    if (video && video.duration) {
      const progress = clampSeekProgress(seekProgressFromX(t.clientX, vpW), video.duration)
      video.currentTime = progress * video.duration
      setSeekProgress(progress)
    }
  }

  function onTouchEnd() {
    if (pendingTouchRef.current) {
      const { startY, startTime, lastY, lastTime } = pendingTouchRef.current
      pendingTouchRef.current = null
      const elapsed = performance.now() - animStartTimeRef.current
      const stillAnimating = animatingRef.current
      const dy = lastY - startY
      const dt = Math.max(lastTime - startTime, 1)
      const velocity = Math.abs(dy) / dt
      const meetsVelocity = velocity > SWIPE_VELOCITY_THRESHOLD
      const canQueue = stillAnimating && elapsed >= 100 && meetsVelocity
      if (stillAnimating) {
        if (canQueue) queuedCommitRef.current = { direction: dy < 0 ? 1 : -1 }
        return
      }
      if (meetsVelocity) {
        const direction = dy < 0 ? 1 : -1
        const targetSlot = slots[CURRENT_SLOT_IDX + direction]
        const newTitle = targetSlot && targetSlot !== "loading" ? titleFromPath(targetSlot.path) : ""
        const newSeekBarVisible = !!(targetSlot && targetSlot !== "loading" && targetSlot.media_type === 1)
        startMediaFade(newTitle, newSeekBarVisible)
        void commitAdvance(direction)
      }
      return
    }
    if (!touchRef.current || animatingRef.current) return
    const { startY, startTime, lastY, lastX, lastTime, mode, pauseDragMode, wasPlaying } = touchRef.current
    touchRef.current = null

    if (seekDragTimerRef.current) { clearTimeout(seekDragTimerRef.current); seekDragTimerRef.current = null }

    if (mode === "seek") {
      if (pauseDragMode) {
        const video = videoRefs.current.get(currentIndex)
        if (video && wasPlaying) { video.play().catch(() => { }); isPausedRef.current = false }
        enterContrastMode()
        return
      }
      const video = videoRefs.current.get(currentIndex)
      if (video && video.duration) {
        const progress = clampSeekProgress(seekProgressFromX(lastX, vpW), video.duration)
        video.currentTime = progress * video.duration
        setSeekProgress(progress)
      }
      return
    }

    const dy = lastY - startY
    const dt = Math.max(lastTime - startTime, 1)
    const velocity = Math.abs(dy) / dt
    const commitByVelocity = velocity > SWIPE_VELOCITY_THRESHOLD
    const commitByDistance = Math.abs(dy) > SWIPE_COMMIT_THRESHOLD * currDims.height

    if (commitByDistance || commitByVelocity) {
      const direction = dy < 0 ? 1 : -1
      const targetSlot = slots[CURRENT_SLOT_IDX + direction]
      const newTitle = targetSlot && targetSlot !== "loading" ? titleFromPath(targetSlot.path) : ""
      const newSeekBarVisible = !!(targetSlot && targetSlot !== "loading" && targetSlot.media_type === 1)
      startMediaFade(newTitle, newSeekBarVisible)
      void commitAdvance(direction)
    } else {
      if (Math.abs(dy) > 5) {
        snapBack()
      } else {
        setDragOffset(0)
      }
      handleTap(lastX, lastY)
      preventNextClickRef.current = true
      setTimeout(() => { preventNextClickRef.current = false }, 600)
    }
  }

  // ── Tap zone handler (shared by touch and mouse) ────────────────────────────
  function handleTap(clientX: number, clientY: number) {
    if (infoTooltipOpen) { setInfoTooltipOpen(false); return }
    if (isSeekBarHit(clientY, vpH)) return

    const currentMedia = slots[CURRENT_SLOT_IDX]
    const isVideo = !!currentMedia && currentMedia !== "loading" && currentMedia.media_type === 1
    const video = isVideo ? videoRefs.current.get(currentIndex) : undefined

    if (isVideo && clientX < vpW * 0.25) {
      if (video) {
        const delta = isRewindPercent ? Math.round((video.duration || 0) * rewindAmount / 100) : rewindAmount
        video.currentTime = Math.max(0, video.currentTime - delta)
        triggerRewindOverlay(delta)
      }
      enterContrastMode()
      return
    }

    if (isVideo && clientX > vpW * 0.75) {
      if (video) {
        const delta = isForwardPercent ? Math.round((video.duration || 0) * fastForwardAmount / 100) : fastForwardAmount
        const maxTime = Math.max(0, (video.duration || 0) - SEEK_END_BUFFER)
        video.currentTime = Math.min(maxTime, video.currentTime + delta)
        triggerForwardOverlay(delta)
      }
      enterContrastMode()
      return
    }

    if (isVideo) {
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
          setSeekBarSubtle(false)
          cancelContrastTimer()
          setContrast({ mode: true, transitionMs: 0 })
        }
      }
      return
    }

    if (contrast.mode) {
      cancelContrastTimer()
      setContrast({ mode: false, transitionMs: 0 })
    } else {
      enterContrastMode()
    }
  }

  function onPlayerClick(e: React.MouseEvent) {
    if (preventNextClickRef.current) return
    if (infoTooltipOpen) { setInfoTooltipOpen(false); return }
    if (isSeekBarHit(e.clientY, vpH)) {
      const video = videoRefs.current.get(currentIndex)
      if (video && video.duration) {
        const progress = clampSeekProgress(seekProgressFromX(e.clientX, vpW), video.duration)
        video.currentTime = progress * video.duration
        setSeekProgress(progress)
        enterContrastMode()
      }
      return
    }
    handleTap(e.clientX, e.clientY)
  }

  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (!open || animatingRef.current) return
    const currentMedia = slots[CURRENT_SLOT_IDX]
    const isVideo = !!currentMedia && currentMedia !== "loading" && currentMedia.media_type === 1
    const video = isVideo ? videoRefs.current.get(currentIndex) : undefined

    if (e.key === "ArrowDown") {
      e.preventDefault()
      const targetSlot = slots[CURRENT_SLOT_IDX + 1]
      const newTitle = targetSlot && targetSlot !== "loading" ? titleFromPath(targetSlot.path) : ""
      const newSeekBarVisible = !!(targetSlot && targetSlot !== "loading" && targetSlot.media_type === 1)
      startMediaFade(newTitle, newSeekBarVisible)
      void commitAdvance(1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const targetSlot = slots[CURRENT_SLOT_IDX - 1]
      const newTitle = targetSlot && targetSlot !== "loading" ? titleFromPath(targetSlot.path) : ""
      const newSeekBarVisible = !!(targetSlot && targetSlot !== "loading" && targetSlot.media_type === 1)
      startMediaFade(newTitle, newSeekBarVisible)
      void commitAdvance(-1)
    } else if (e.key === " " && isVideo && video) {
      e.preventDefault()
      if (video.paused) {
        video.play().catch(() => { })
        triggerPlayPauseOverlay("play")
        isPausedRef.current = false
        enterContrastMode()
      } else {
        video.pause()
        triggerPlayPauseOverlay("pause")
        isPausedRef.current = true
        setSeekBarSubtle(false)
        cancelContrastTimer()
        setContrast({ mode: true, transitionMs: 0 })
      }
    } else if (e.key === "ArrowLeft" && video) {
      e.preventDefault()
      const delta = isRewindPercent ? Math.round((video.duration || 0) * rewindAmount / 100) : rewindAmount
      video.currentTime = Math.max(0, video.currentTime - delta)
      triggerRewindOverlay(delta)
      enterContrastMode()
    } else if (e.key === "ArrowRight" && video) {
      e.preventDefault()
      const delta = isForwardPercent ? Math.round((video.duration || 0) * fastForwardAmount / 100) : fastForwardAmount
      const maxTime = Math.max(0, (video.duration || 0) - SEEK_END_BUFFER)
      video.currentTime = Math.min(maxTime, video.currentTime + delta)
      triggerForwardOverlay(delta)
      enterContrastMode()
    }
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => keyHandlerRef.current?.(e)
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open])

  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null)
  wheelHandlerRef.current = (e: WheelEvent) => {
    if (!open || animatingRef.current) return
    e.preventDefault()
    const direction = e.deltaY > 0 ? 1 : -1
    const targetSlot = slots[CURRENT_SLOT_IDX + direction]
    const newTitle = targetSlot && targetSlot !== "loading" ? titleFromPath(targetSlot.path) : ""
    const newSeekBarVisible = !!(targetSlot && targetSlot !== "loading" && targetSlot.media_type === 1)
    startMediaFade(newTitle, newSeekBarVisible)
    void commitAdvance(direction)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: WheelEvent) => wheelHandlerRef.current?.(e)
    document.addEventListener("wheel", handler, { passive: false })
    return () => document.removeEventListener("wheel", handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [open])

  const videoEndBehaviorRef = useRef(videoEndBehavior)
  videoEndBehaviorRef.current = videoEndBehavior

  function getVideoRef(mediaIdx: number): React.RefCallback<HTMLVideoElement> {
    return (el) => {
      if (el) videoRefs.current.set(mediaIdx, el)
      else videoRefs.current.delete(mediaIdx)
    }
  }

  const seekBarStyle: React.CSSProperties = {
    background: `linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ${seekProgress * 100}%, rgba(96,96,96,0.8) ${seekProgress * 100}%, rgba(96,96,96,0.8) 100%)`,
  }

  const overlayTransition = `opacity ${contrast.transitionMs}ms ease`

  return (
    <div
      className={`${styles.player} ${isOpen ? styles.playerOpen : ""}`}
      role="application"
      aria-label="Media player"
      onClick={onPlayerClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onPlayerClick(e as unknown as React.MouseEvent) }}
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
            slotDims = { width: vpW, height: vpH, offsetX: 0 }
            const mDims = allDims[i] ?? fallbackDims
            const restingMediaTop = i === 0
              ? vpH - mDims.height
              : i === CURRENT_SLOT_IDX
                ? (vpH - mDims.height) / 2
                : 0
            const mediaTopInDiv = mediaTargetTops?.[i] ?? restingMediaTop
            mediaStyle = {
              position: "absolute",
              width: mDims.width,
              height: mDims.height,
              left: mDims.offsetX,
              top: mediaTopInDiv,
              transition: mediaTargetTops ? "top 0.2s ease" : undefined,
            }
          } else {
            slotDims = allDims[i] ?? fallbackDims
          }
          const onError = () => setErrorIndices((prev) => new Set(prev).add(mediaIdx))
          const onEnded = i === CURRENT_SLOT_IDX ? () => {
            const behavior = videoEndBehaviorRef.current
            if (behavior === "loop") {
              videoRefs.current.get(mediaIdx)?.play().catch(() => { })
            } else if (behavior === "stop") {
              isPausedRef.current = true
              setSeekBarSubtle(false)
              cancelContrastTimer()
              setContrast({ mode: true, transitionMs: 0 })
            } else if (behavior === "next") {
              void commitAdvance(1)
            }
          } : undefined
          return renderSlot(
            mediaIdx, item, slotDims, getItemTop(i), i === CURRENT_SLOT_IDX,
            open, getVideoRef(mediaIdx), ofoatAnimating, onError, errorIndices.has(mediaIdx), mediaStyle, isPausedRef,
            onEnded,
          )
        })}
      </div>

      <PlayerControls
        controlsOpacity={controlsOpacity}
        seekBarOpacity={seekBarOpacity}
        overlayTransition={overlayTransition}
        displayedTitle={displayedTitle}
        seekBarVisible={seekBarVisible}
        timeRemaining={timeRemaining}
        seekBarStyle={seekBarStyle}
        blackOverlayOpacity={blackOverlayOpacity}
        rewindOverlay={rewindOverlay}
        playPauseOverlay={playPauseOverlay}
        forwardOverlay={forwardOverlay}
        isRewindPercent={isRewindPercent}
        isForwardPercent={isForwardPercent}
        isFullscreen={isFullscreen}
        currentMedia={currentSlot && currentSlot !== "loading" ? currentSlot : null}
        infoTooltipOpen={infoTooltipOpen}
        onInfoToggle={(e) => { e.stopPropagation(); setInfoTooltipOpen((v) => !v) }}
        onClose={onClose}
        onToggleFullscreen={toggleFullscreen}
      />
    </div>
  )
}
