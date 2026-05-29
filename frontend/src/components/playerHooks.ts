import { useEffect, useRef, useState } from "react"
import type { MediaInfo } from "@repo/types"

export type SlotItem = MediaInfo | null | "loading"

const OVERLAY_ACCUMULATE_MS = 500

function formatTimeRemaining(video: HTMLVideoElement): string | null {
  if (!video.duration) return null
  const remaining = Math.max(0, video.duration - video.currentTime)
  const mins = Math.floor(remaining / 60)
  const secs = Math.floor(remaining % 60)
  return `-${mins}:${secs.toString().padStart(2, "0")}`
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    function onChange() { setIsFullscreen(!!document.fullscreenElement) }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else document.documentElement.requestFullscreen().catch(() => {})
  }
  return { isFullscreen, toggleFullscreen }
}

export function useViewportSize() {
  const [vpW, setVpW] = useState(globalThis.innerWidth ?? 375)
  const [vpH, setVpH] = useState(globalThis.innerHeight ?? 667)
  useEffect(() => {
    function onResize() { setVpW(globalThis.innerWidth); setVpH(globalThis.innerHeight) }
    globalThis.addEventListener("resize", onResize)
    return () => globalThis.removeEventListener("resize", onResize)
  }, [])
  return { vpW, vpH }
}

export function useTapOverlays(rewindSeconds: number, fastForwardSeconds: number) {
  const [rewindOverlay, setRewindOverlay] = useState<{ key: number; value: number } | null>(null)
  const [forwardOverlay, setForwardOverlay] = useState<{ key: number; value: number } | null>(null)
  const [playPauseOverlay, setPlayPauseOverlay] = useState<{ key: number; action: "play" | "pause" } | null>(null)
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

  return { rewindOverlay, forwardOverlay, playPauseOverlay, triggerRewindOverlay, triggerForwardOverlay, triggerPlayPauseOverlay }
}

export function useSeekBar(
  currentIndex: number,
  currentSlot: SlotItem | undefined,
  videoRefs: { current: Map<number, HTMLVideoElement> },
) {
  const [seekProgress, setSeekProgress] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null)
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
  }, [currentIndex, currentSlot, videoRefs])
  return { seekProgress, setSeekProgress, timeRemaining, setTimeRemaining }
}
