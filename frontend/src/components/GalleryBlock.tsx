import { useEffect, useMemo, useRef, useState } from "react"
import type { BlockInfo, Preset } from "@repo/types"
import { encodePath } from "../api/media"
import styles from "./Gallery.module.css"

export function SkeletonBlock() {
  return (
    <div className={styles.block} data-testid="skeleton-block">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={`${styles.cell} ${styles.skeleton}`} style={{ flex: 1 }} />
      ))}
    </div>
  )
}

function FilmPlaceholder({ ar }: { ar: number }) {
  const h = 60
  const w = Math.round(h * ar)
  const cx = w / 2
  const triSize = Math.round(Math.min(w, h) * 0.14)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: "35%", height: "35%", opacity: 0.4 }}
    >
      <rect x="1.25" y="1.25" width={w - 2.5} height={h - 2.5} rx="6" fill="none" stroke="white" strokeWidth="2.5" />
      <polygon points={`${cx - triSize},${h / 2 - triSize} ${cx - triSize},${h / 2 + triSize} ${cx + triSize},${h / 2}`} fill="white" />
    </svg>
  )
}

interface VideoTileProps {
  src: string
  style: React.CSSProperties
}

function VideoTile({ src, style }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) video.play().catch(() => { })
      else video.pause()
    })
    obs.observe(video)
    return () => obs.disconnect()
  }, [])
  return <video ref={videoRef} src={src} autoPlay muted loop playsInline style={style} aria-label="Gallery tile video" />
}

function titleFromPath(path: string): string {
  const filename = path.split("/").pop() ?? ""
  return filename.replace(/\.[^.]+$/, "")
}

function tileFontSize(tileW: number): string {
  if (tileW < 100) return "10px"
  if (tileW < 180) return "12px"
  if (tileW < 280) return "14px"
  return "16px"
}

function computeTileSize(
  tileW: number,
  blockH: number,
  previewAR: number,
  tileCropMaxX: number,
  tileCropMaxY: number,
): { width: number; height: number } {
  const tileAR = tileW / blockH
  if (previewAR === tileAR) return { width: tileW, height: blockH }
  if (previewAR < tileAR) {
    const imgH = tileW / previewAR
    const maxImgH = tileCropMaxY >= 0.5 ? Infinity : blockH / (1 - 2 * tileCropMaxY)
    const imgH_final = Math.min(imgH, maxImgH)
    return { width: imgH_final * previewAR, height: imgH_final }
  }
  const imgW = blockH * previewAR
  const maxImgW = tileCropMaxX >= 0.5 ? Infinity : tileW / (1 - 2 * tileCropMaxX)
  const imgW_final = Math.min(imgW, maxImgW)
  return { width: imgW_final, height: imgW_final / previewAR }
}

// Small white corner triangle indicating a video is playable on hover/touch.
function TouchIndicator() {
  return (
    <svg
      style={{ position: "absolute", top: 6, right: 6, width: 12, height: 12, opacity: 0.85, pointerEvents: "none" }}
      viewBox="0 0 10 10"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <polygon points="2,1 2,9 9,5" fill="white" />
    </svg>
  )
}

interface TouchToHighlightVideoTileProps {
  tileIndex: number
  tileWidth: number
  blockHeightPx: number
  path: string
  mediaStyle: React.CSSProperties
  previewAR: number
  hasThumbnail: boolean
  hasHighlight: boolean
  videoFallbackToOriginal: boolean
  showTileTitle: boolean
  tileW: number
  activeTouchTileRef: React.MutableRefObject<(() => void) | null>
  onTileClick: (index: number) => void
}

function TouchToHighlightVideoTile({
  tileIndex,
  tileWidth,
  blockHeightPx,
  path,
  mediaStyle,
  previewAR,
  hasThumbnail,
  hasHighlight,
  videoFallbackToOriginal,
  showTileTitle,
  tileW,
  activeTouchTileRef,
  onTileClick,
}: TouchToHighlightVideoTileProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const awaitingClickRef = useRef(false)
  const awaitingClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const videoSrc = hasHighlight
    ? `/highlights/${encodePath(path)}.mp4`
    : videoFallbackToOriginal
      ? `/media/${encodePath(path)}`
      : null

  const hasVideoToPlay = videoSrc !== null

  function stopPlaying() {
    isPlayingRef.current = false
    setIsPlaying(false)
    // Only clear the shared ref if it still points to us.
    if (activeTouchTileRef.current === stopPlaying) {
      activeTouchTileRef.current = null
    }
    const video = videoRef.current
    if (video) { video.pause(); video.currentTime = 0 }
  }

  function startPlaying() {
    if (!videoSrc) return
    activeTouchTileRef.current?.()
    activeTouchTileRef.current = stopPlaying
    isPlayingRef.current = true
    setIsPlaying(true)
  }

  // Play and observe scroll when isPlaying becomes true.
  useEffect(() => {
    if (!isPlaying) return
    const video = videoRef.current
    if (!video) return
    video.play().catch(() => { })
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) stopPlaying()
    })
    obs.observe(video)
    return () => obs.disconnect()
  }, [isPlaying])

  function clearAwaitingClick() {
    if (awaitingClickTimerRef.current) {
      clearTimeout(awaitingClickTimerRef.current)
      awaitingClickTimerRef.current = null
    }
    awaitingClickRef.current = false
  }

  function handlePointerEnter(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && hasVideoToPlay) startPlaying()
  }

  function handlePointerLeave(e: React.PointerEvent) {
    if (e.pointerType === "mouse") stopPlaying()
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "touch" || isPlayingRef.current || !hasVideoToPlay) return
    touchStartRef.current = { x: e.clientX, y: e.clientY }
    awaitingClickRef.current = true
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (e.pointerType !== "touch" || !awaitingClickRef.current || !touchStartRef.current) return
    const dx = e.clientX - touchStartRef.current.x
    const dy = e.clientY - touchStartRef.current.y
    if (dx * dx + dy * dy > 15 * 15) {
      // Gesture (swipe/scroll) — start immediately, won't generate a click.
      clearAwaitingClick()
      touchStartRef.current = null
      startPlaying()
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (e.pointerType !== "touch" || !awaitingClickRef.current) return
    // Finger lifted with minimal movement — wait to see if click fires (tap) or not (hold).
    awaitingClickTimerRef.current = setTimeout(() => {
      awaitingClickRef.current = false
      awaitingClickTimerRef.current = null
      touchStartRef.current = null
      startPlaying()
    }, 350)
  }

  function handlePointerCancel() {
    if (!awaitingClickRef.current) return
    // Browser took over (e.g. scroll snap) — not a tap.
    clearAwaitingClick()
    touchStartRef.current = null
    startPlaying()
  }

  function handleClick() {
    // Clean tap — cancel any pending play and open player.
    clearAwaitingClick()
    touchStartRef.current = null
    onTileClick(tileIndex)
  }

  const thumbnailSrc = hasThumbnail ? `/thumbnails/${encodePath(path)}.webp` : null

  return (
    <button
      type="button"
      className={styles.cell}
      style={{ width: `${tileWidth * 100}%`, height: blockHeightPx, overflow: "hidden", position: "relative" }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
    >
      {isPlaying && videoSrc ? (
        <video ref={videoRef} src={videoSrc} muted loop playsInline style={mediaStyle} aria-label="Gallery tile video" />
      ) : thumbnailSrc ? (
        <img src={thumbnailSrc} alt={path} loading="lazy" style={mediaStyle} />
      ) : (
        <div style={{ ...mediaStyle, background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FilmPlaceholder ar={previewAR} />
        </div>
      )}
      {!isPlaying && hasThumbnail && <TouchIndicator />}
      {showTileTitle && (
        <div className={styles.tileTitleOverlay}>
          <span className={styles.tileTitleText} style={{ fontSize: tileFontSize(tileW) }}>
            {titleFromPath(path)}
          </span>
        </div>
      )}
    </button>
  )
}

export interface BlockProps {
  block: BlockInfo
  onTileClick: (shuffleIndex: number) => void
  galleryWidthPx: number
  tileCropMaxX: number
  tileCropMaxY: number
  showTileTitle: boolean
  galleryGap: number
  videoTileType: Preset["videoTileType"]
  videoFallbackToOriginal: boolean
  activeTouchTileRef: React.MutableRefObject<(() => void) | null>
}

export function Block({
  block,
  onTileClick,
  galleryWidthPx,
  tileCropMaxX,
  tileCropMaxY,
  showTileTitle,
  galleryGap,
  videoTileType,
  videoFallbackToOriginal,
  activeTouchTileRef,
}: BlockProps) {
  const blockHeightPx = useMemo(() => {
    if (block.tiles.length === 0 || galleryWidthPx === 0) return 0
    const sum = block.tiles.reduce((acc, tile) => {
      const previewAR = tile.preview.width / tile.preview.height
      return acc + (tile.width * galleryWidthPx) / previewAR
    }, 0)
    return Math.ceil(sum / block.tiles.length)
  }, [block, galleryWidthPx])

  return (
    <div className={styles.block} style={{ gap: galleryGap }}>
      {block.tiles.map((tile) => {
        const tileW = tile.width * galleryWidthPx
        const previewAR = tile.preview.width / tile.preview.height
        const { width: imgW, height: imgH } = computeTileSize(tileW, blockHeightPx, previewAR, tileCropMaxX, tileCropMaxY)
        const imgWc = Math.ceil(imgW)
        const imgHc = Math.ceil(imgH)
        const mediaStyle: React.CSSProperties = {
          position: "absolute",
          top: Math.floor((blockHeightPx - imgHc) / 2),
          left: Math.floor((tileW - imgWc) / 2),
          width: imgWc,
          height: imgHc,
        }
        const { previewType, path, hasHighlight, hasThumbnail, media_type } = tile.preview
        const isVideo = media_type === 1

        // touch-to-highlight: full custom rendering per tile
        if (isVideo && videoTileType === "touch-to-highlight") {
          return (
            <TouchToHighlightVideoTile
              key={tile.index}
              tileIndex={tile.index}
              tileWidth={tile.width}
              blockHeightPx={blockHeightPx}
              path={path}
              mediaStyle={mediaStyle}
              previewAR={previewAR}
              hasThumbnail={hasThumbnail}
              hasHighlight={hasHighlight}
              videoFallbackToOriginal={videoFallbackToOriginal}
              showTileTitle={showTileTitle}
              tileW={tileW}
              activeTouchTileRef={activeTouchTileRef}
              onTileClick={onTileClick}
            />
          )
        }

        return (
          <button
            key={tile.index}
            type="button"
            className={styles.cell}
            style={{ width: `${tile.width * 100}%`, height: blockHeightPx, overflow: "hidden", position: "relative" }}
            onClick={() => onTileClick(tile.index)}
          >
            {isVideo && videoTileType === "thumbnail-only" ? (
              // Never show highlight; degrade to thumbnail or placeholder.
              hasThumbnail ? (
                <img src={`/thumbnails/${encodePath(path)}.webp`} alt={path} loading="lazy" style={mediaStyle} />
              ) : (
                <div style={{ ...mediaStyle, background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FilmPlaceholder ar={previewAR} />
                </div>
              )
            ) : isVideo && videoTileType === "highlight-if-available" && !hasHighlight && videoFallbackToOriginal ? (
              // Fallback to original video when no highlight exists.
              <VideoTile src={`/media/${encodePath(path)}`} style={mediaStyle} />
            ) : previewType === "highlight" ? (
              <VideoTile src={`/highlights/${encodePath(path)}.mp4`} style={mediaStyle} />
            ) : previewType === "thumbnail" ? (
              <img src={`/thumbnails/${encodePath(path)}.webp`} alt={path} loading="lazy" style={mediaStyle} />
            ) : previewType === "original" ? (
              <img src={`/media/${encodePath(path)}`} alt={path} loading="lazy" style={mediaStyle} />
            ) : (
              <div style={{ ...mediaStyle, background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FilmPlaceholder ar={previewAR} />
              </div>
            )}
            {isVideo && (
              (videoTileType === "thumbnail-only" && hasThumbnail) ||
              (videoTileType === "highlight-if-available" && previewType === "thumbnail" && !videoFallbackToOriginal)
            ) && <TouchIndicator />}
            {showTileTitle && (
              <div className={styles.tileTitleOverlay}>
                <span className={styles.tileTitleText} style={{ fontSize: tileFontSize(tileW) }}>
                  {titleFromPath(path)}
                </span>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
