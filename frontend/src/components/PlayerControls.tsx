import type { MediaInfo } from "@repo/types"
import styles from "./Player.module.css"

const OVERLAY_FADE_DURATION_MS = 600
const TITLE_ROW_BOTTOM = 8

function Spinner() {
  return <div className={styles.spinner} />
}

function PlayIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="white" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }}>
      <polygon points="14,8 40,24 14,40" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="white" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }}>
      <rect x="11" y="8" width="10" height="32" />
      <rect x="27" y="8" width="10" height="32" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" strokeWidth="3" />
    </svg>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(mdate: number): string {
  return new Date(mdate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

export { Spinner }

export interface PlayerControlsProps {
  controlsOpacity: number
  seekBarOpacity: number
  overlayTransition: string
  displayedTitle: string
  seekBarVisible: boolean
  timeRemaining: string | null
  seekBarStyle: React.CSSProperties
  blackOverlayOpacity: number
  rewindOverlay: { key: number; value: number } | null
  playPauseOverlay: { key: number; action: "play" | "pause" } | null
  forwardOverlay: { key: number; value: number } | null
  rewindSeconds: number
  fastForwardSeconds: number
  isFullscreen: boolean
  currentMedia: MediaInfo | null
  infoTooltipOpen: boolean
  onInfoToggle: (e: React.MouseEvent) => void
  onClose: () => void
  onToggleFullscreen: () => void
}

export function PlayerControls({
  controlsOpacity, seekBarOpacity, overlayTransition, displayedTitle, seekBarVisible, timeRemaining,
  seekBarStyle, blackOverlayOpacity, rewindOverlay, playPauseOverlay, forwardOverlay,
  rewindSeconds, fastForwardSeconds, isFullscreen, currentMedia, infoTooltipOpen, onInfoToggle,
  onClose, onToggleFullscreen,
}: PlayerControlsProps) {
  return (
    <>
      <div
        className={styles.bottomOverlay}
        style={{ opacity: blackOverlayOpacity, transition: overlayTransition }}
      />
      <div
        className={styles.titleRow}
        style={{ opacity: controlsOpacity, transition: overlayTransition, bottom: TITLE_ROW_BOTTOM }}
      >
        <span className={styles.titleText}>{displayedTitle}</span>
        {seekBarVisible && timeRemaining && (
          <span className={styles.timeRemaining}>{timeRemaining}</span>
        )}
      </div>
      <button
        type="button"
        className={styles.infoBtn}
        onClick={onInfoToggle}
        onTouchStart={(e) => e.stopPropagation()}
        aria-label="Media info"
      >
        <InfoIcon />
      </button>
      {infoTooltipOpen && currentMedia && (
        <div className={styles.infoTooltip}>
          <span>{currentMedia.path}</span>
          <span>{formatDate(currentMedia.mdate)}</span>
          <span>{formatBytes(currentMedia.filesize)}</span>
          <span>{currentMedia.width}w × {currentMedia.height}h</span>
          {currentMedia.duration != null && (
            <span>{formatDuration(currentMedia.duration)}</span>
          )}
        </div>
      )}
      {seekBarVisible && (
        <div className={styles.seekBarWrapper} style={{ opacity: seekBarOpacity, transition: overlayTransition }}>
          <div className={styles.seekBar} style={seekBarStyle} />
        </div>
      )}
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
      <button type="button" className={styles.backBtn} onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="Back">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
        </svg>
      </button>
      <button type="button" className={styles.fullscreenBtn} onClick={(e) => { e.stopPropagation(); onToggleFullscreen() }} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
        {isFullscreen
          ? <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          : <span className={styles.fullscreenIcon}>⛶</span>
        }
      </button>
    </>
  )
}
