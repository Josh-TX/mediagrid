import { useEffect, useMemo, useRef } from "react"
import type { BlockInfo } from "@repo/types"
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
      if (entry?.isIntersecting) video.play().catch(() => {})
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

export interface BlockProps {
  block: BlockInfo
  onTileClick: (shuffleIndex: number) => void
  galleryWidthPx: number
  tileCropMaxX: number
  tileCropMaxY: number
  showTileTitle: boolean
}

export function Block({ block, onTileClick, galleryWidthPx, tileCropMaxX, tileCropMaxY, showTileTitle }: BlockProps) {
  const blockHeightPx = useMemo(() => {
    if (block.tiles.length === 0 || galleryWidthPx === 0) return 0
    const sum = block.tiles.reduce((acc, tile) => {
      const previewAR = tile.preview.width / tile.preview.height
      return acc + (tile.width * galleryWidthPx) / previewAR
    }, 0)
    return Math.ceil(sum / block.tiles.length)
  }, [block, galleryWidthPx])

  return (
    <div className={styles.block}>
      {block.tiles.map((tile) => {
        const tileW = tile.width * galleryWidthPx
        const previewAR = tile.preview.width / tile.preview.height
        const { width: imgW, height: imgH } = computeTileSize(tileW, blockHeightPx, previewAR, tileCropMaxX, tileCropMaxY)
        const imgWc = Math.ceil(imgW)
        const imgHc = Math.ceil(imgH)
        if (imgHc === 198) {
          console.log({ blockHeightPx, imgH, imgHc, top: Math.floor((blockHeightPx - imgHc) / 2), tileW, imgW, imgWc, left: Math.floor((tileW - imgWc) / 2) })
        }
        const mediaStyle: React.CSSProperties = {
          position: "absolute",
          top: Math.floor((blockHeightPx - imgHc) / 2),
          left: Math.floor((tileW - imgWc) / 2),
          width: imgWc,
          height: imgHc,
        }
        const { previewType, path } = tile.preview
        return (
          <button
            key={tile.index}
            type="button"
            className={styles.cell}
            style={{ width: `${tile.width * 100}%`, height: blockHeightPx, overflow: "hidden", position: "relative" }}
            onClick={() => onTileClick(tile.index)}
          >
            {previewType === "highlight" ? (
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
