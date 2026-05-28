import * as Toast from "@radix-ui/react-toast"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react"
import type { BlockInfo } from "@repo/types"
import { fetchBlocks, fetchPresets, encodePath } from "../api/media"
import { SettingsModal } from "./SettingsModal"
import { Player } from "./Player"
import styles from "./Gallery.module.css"

function SkeletonBlock() {
  return (
    <div className={styles.block} data-testid="skeleton-block">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={`${styles.cell} ${styles.skeleton}`} style={{ flex: 1 }} />
      ))}
    </div>
  )
}

interface VideoTileProps {
  src: string
  style: React.CSSProperties
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

function VideoTile({ src, style }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        video.play().catch(() => {})
      } else {
        video.pause()
      }
    })
    obs.observe(video)
    return () => obs.disconnect()
  }, [])
  return <video ref={videoRef} src={src} autoPlay muted loop playsInline style={style} aria-label="Gallery tile video" />
}

/** Extracts the display title from a media path: last path segment with extension stripped. */
function titleFromPath(path: string): string {
  const filename = path.split("/").pop() ?? ""
  return filename.replace(/\.[^.]+$/, "")
}

/**
 * Maps a tile's pixel width to a font size in 2px steps (10–16px).
 * Wider tiles get larger text; narrow tiles stay readable at small sizes.
 */
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

  if (previewAR === tileAR) {
    return { width: tileW, height: blockH }
  }

  if (previewAR < tileAR) {
    // Portrait preview — crop top/bottom
    const imgH = tileW / previewAR
    const maxImgH = tileCropMaxY >= 0.5 ? Infinity : blockH / (1 - 2 * tileCropMaxY)
    const imgH_final = Math.min(imgH, maxImgH)
    return { width: imgH_final * previewAR, height: imgH_final }
  }

  // Landscape preview — crop left/right
  const imgW = blockH * previewAR
  const maxImgW = tileCropMaxX >= 0.5 ? Infinity : tileW / (1 - 2 * tileCropMaxX)
  const imgW_final = Math.min(imgW, maxImgW)
  return { width: imgW_final, height: imgW_final / previewAR }
}

interface BlockProps {
  block: BlockInfo
  onTileClick: (shuffleIndex: number) => void
  galleryWidthPx: number
  tileCropMaxX: number
  tileCropMaxY: number
  showTileTitle: boolean
}

function Block({ block, onTileClick, galleryWidthPx, tileCropMaxX, tileCropMaxY, showTileTitle }: BlockProps) {
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
            style={{
              width: `${tile.width * 100}%`,
              height: blockHeightPx,
              overflow: "hidden",
              position: "relative",
            }}
            onClick={() => onTileClick(tile.index)}
          >
            {previewType === "highlight" ? (
              <VideoTile src={`/highlights/${encodePath(path)}.mp4`} style={mediaStyle} />
            ) : previewType === "thumbnail" ? (
              <img src={`/thumbnails/${encodePath(path)}.webp`} alt={path} loading="lazy" style={mediaStyle} />
            ) : previewType === "original" ? (
              <img src={`/media/${encodePath(path)}`} alt={path} loading="lazy" style={mediaStyle} />
            ) : (
              <div
                style={{
                  ...mediaStyle,
                  background: "#222",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FilmPlaceholder ar={previewAR} />
              </div>
            )}
            {showTileTitle && (
              <div className={styles.tileTitleOverlay}>
                <span
                  className={styles.tileTitleText}
                  style={{ fontSize: tileFontSize(tileW) }}
                >
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

type SortType = "random" | "size" | "az" | "date"
type SortDir = "asc" | "desc"

function readUrlParams() {
  const params = new URLSearchParams(window.location.search)
  const sortRaw = params.get("sort") ?? "random"
  const sort: SortType = (sortRaw === "size" || sortRaw === "az" || sortRaw === "date") ? sortRaw : "random"
  const dirRaw = params.get("dir") ?? "asc"
  const dir: SortDir = dirRaw === "desc" ? "desc" : "asc"
  return {
    q: params.get("q") ?? "",
    preset: params.get("preset") ?? "default",
    s: params.get("s") !== null ? Number(params.get("s")) : null,
    sort,
    dir,
  }
}

function writeUrlParams(q: string, preset: string, shuffleId: number | null, sort: SortType, dir: SortDir) {
  const params = new URLSearchParams()
  if (q.trim()) params.set("q", q.trim())
  if (preset !== "default") params.set("preset", preset)
  if (sort !== "random") params.set("sort", sort)
  if (dir !== "asc") params.set("dir", dir)
  if (shuffleId !== null) params.set("s", String(shuffleId))
  const qs = params.toString()
  history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname)
}

type ToastAction = { type: 'show'; message: string } | { type: 'hide' }
function toastReducer(_s: { open: boolean; message: string }, a: ToastAction) {
  return a.type === 'show' ? { open: true, message: a.message } : { ..._s, open: false }
}

type PlayerAction = { type: 'open'; index: number } | { type: 'close' }
function playerReducer(s: { open: boolean; index: number; sessionKey: number }, a: PlayerAction) {
  return a.type === 'open' ? { open: true, index: a.index, sessionKey: s.sessionKey + 1 } : { ...s, open: false }
}

type ModalAction = { type: 'open' } | { type: 'close' }
function modalReducer(s: { open: boolean; key: number }, a: ModalAction) {
  return a.type === 'open' ? { open: true, key: s.key + 1 } : { ...s, open: false }
}

export function Gallery() {
  const queryClient = useQueryClient()
  const { data: presets, isError: presetsError } = useQuery({
    queryKey: ["presets"],
    queryFn: fetchPresets,
  })

  const initialParams = useMemo(() => readUrlParams(), [])
  const [search, setSearch] = useState(initialParams.q)
  const [debouncedSearch, setDebouncedSearch] = useState(initialParams.q)
  const [activePreset, setActivePreset] = useState(initialParams.preset)
  const [shuffleId, setShuffleId] = useState<number | null>(initialParams.s)
  const [sort, setSort] = useState<SortType>(initialParams.sort)
  const [dir, setDir] = useState<SortDir>(initialParams.dir)
  const [toastState, dispatchToast] = useReducer(toastReducer, { open: false, message: '' })
  const [playerState, dispatchPlayer] = useReducer(playerReducer, { open: false, index: 0, sessionKey: 0 })
  const [modalState, dispatchModal] = useReducer(modalReducer, { open: false, key: 0 })
  const galleryRef = useRef<HTMLDivElement>(null)

  const subscribeToGalleryWidth = useCallback((onStoreChange: () => void) => {
    const el = galleryRef.current
    if (!el) return () => {}
    const obs = new ResizeObserver(onStoreChange)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const galleryWidthPx = useSyncExternalStore(
    subscribeToGalleryWidth,
    () => galleryRef.current?.clientWidth ?? window.innerWidth,
    () => window.innerWidth,
  )

  const activePresetData = presets?.find((p) => p.name === activePreset)
  const tileCropMaxX = activePresetData?.tileCropMaxX ?? 0.1
  const tileCropMaxY = activePresetData?.tileCropMaxY ?? 0.1
  const playerCropMaxX = activePresetData?.playerCropMaxX ?? 0
  const playerCropMaxY = activePresetData?.playerCropMaxY ?? 0
  const forwardPreloadCount = activePresetData?.forwardPreloadCount ?? 1
  const backwardPreloadCount = activePresetData?.backwardPreloadCount ?? 1
  const oneFileAtATime = activePresetData?.oneFileAtATime ?? false
  const rewindSeconds = activePresetData?.rewindSeconds ?? 10
  const fastForwardSeconds = activePresetData?.fastForwardSeconds ?? 10
  const showTileTitle = activePresetData?.showTileTitle ?? true

  // Keep a ref so the queryFn closure always has the latest shuffleId without being in the key.
  const shuffleIdRef = useRef<number | null>(shuffleId)
  shuffleIdRef.current = shuffleId

  // Clear the ref synchronously during render (before RQ's effect fires queryFn).
  const prevSearchRef = useRef(debouncedSearch)
  const prevPresetRef = useRef(activePreset)
  const prevSortRef = useRef(sort)
  const prevDirRef = useRef(dir)
  if (
    prevSearchRef.current !== debouncedSearch ||
    prevPresetRef.current !== activePreset ||
    prevSortRef.current !== sort ||
    prevDirRef.current !== dir
  ) {
    shuffleIdRef.current = null
    prevSearchRef.current = debouncedSearch
    prevPresetRef.current = activePreset
    prevSortRef.current = sort
    prevDirRef.current = dir
  }

  const sentinelRef = useRef<HTMLDivElement>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }, [])

  // Single source of truth for URL — runs whenever any URL-relevant state changes.
  useEffect(() => {
    writeUrlParams(debouncedSearch, activePreset, shuffleId, sort, dir)
  }, [debouncedSearch, activePreset, shuffleId, sort, dir])

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isPending,
    isError,
  } = useInfiniteQuery({
    queryKey: ["blocks", debouncedSearch, activePreset, sort, dir],
    queryFn: async ({ pageParam }) => {
      try {
        const res = await fetchBlocks(shuffleIdRef.current, pageParam, debouncedSearch, activePreset, sort, dir)
        // First response establishes the shuffleId for subsequent pages.
        if (shuffleIdRef.current === null) {
          setShuffleId(res.shuffleId)
        }
        return res
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) {
          handleShuffleExpired()
        } else {
          dispatchToast({ type: 'show', message: "Failed to load media" })
        }
        throw err
      }
    },
    initialPageParam: [0, 1, 2] as number[],
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, p) => sum + p.blocks.length, 0)
      return totalFetched < lastPage.totalBlocks ? [totalFetched] : undefined
    },
    enabled: !!presets,
    gcTime: 0,
  })

  function handleShuffleExpired() {
    shuffleIdRef.current = null // sync so the next queryFn sees null before React re-renders
    setShuffleId(null)
    dispatchPlayer({ type: 'close' })
    queryClient.resetQueries({ queryKey: ["blocks", debouncedSearch, activePreset, sort, dir] })
  }

  function handleTileClick(shuffleIndex: number) {
    dispatchPlayer({ type: 'open', index: shuffleIndex })
  }

  function handleShowToast(message: string) {
    dispatchToast({ type: 'show', message })
  }

  // Gate scroll trigger until shuffleId is set so the first page response arrives before any extra fetches.
  const canFetchNext = hasNextPage && shuffleId !== null

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !canFetchNext || isFetching) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) fetchNextPage()
      },
      { rootMargin: "200px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [canFetchNext, isFetching, fetchNextPage, data?.pages.length])

  function handlePresetChange(name: string) {
    shuffleIdRef.current = null
    setActivePreset(name)
    setShuffleId(null)
    window.scrollTo(0, 0)
    queryClient.resetQueries({ queryKey: ["blocks", debouncedSearch, name, sort, dir] })
  }

  /** Re-shuffles random layout by resetting shuffleId (same as changing search/preset). */
  function handleReshuffle() {
    shuffleIdRef.current = null
    setShuffleId(null)
    window.scrollTo(0, 0)
    queryClient.resetQueries({ queryKey: ["blocks", debouncedSearch, activePreset, sort, dir] })
  }

  function handleSortChange(newSort: SortType) {
    shuffleIdRef.current = null
    setSort(newSort)
    setShuffleId(null)
    window.scrollTo(0, 0)
    // Reset dir to asc when switching to a non-random sort for the first time.
    if (newSort !== "random" && sort === "random") setDir("asc")
  }

  function handleDirToggle() {
    shuffleIdRef.current = null
    setDir((d) => (d === "asc" ? "desc" : "asc"))
    setShuffleId(null)
    window.scrollTo(0, 0)
  }

  function handleModalOpenChange(open: boolean) {
    if (!open) {
      const { preset: urlPreset } = readUrlParams()
      if (urlPreset !== activePreset) {
        window.scrollTo(0, 0)
        setShuffleId(null)
      }
      setActivePreset(urlPreset)
      dispatchModal({ type: 'close' })
    }
  }

  const loadedBlocks = useMemo(() => data?.pages.flatMap((p) => p.blocks) ?? [], [data])
  const totalBlocks = data?.pages[0]?.totalBlocks ?? null
  const totalMedia = data?.pages[0]?.totalMedia ?? 0

  const showSkeleton = isPending || isFetchingNextPage
  const allLoaded = totalBlocks !== null && loadedBlocks.length >= totalBlocks
  const isEmpty = !isFetching && !isError && totalMedia === 0 && totalBlocks !== null

  if (presetsError) {
    return (
      <div className={styles.errorState} data-testid="presets-error">
        Failed to load presets. Please refresh the page.
      </div>
    )
  }

  return (
    <Toast.Provider>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.sortDirBtn}
            onClick={sort === "random" ? handleReshuffle : handleDirToggle}
            aria-label={sort === "random" ? "Re-shuffle" : dir === "asc" ? "Sort ascending" : "Sort descending"}
            title={sort === "random" ? "Re-shuffle" : dir === "asc" ? "Ascending" : "Descending"}
          >
            {sort === "random" ? "↺" : dir === "asc" ? "↑" : "↓"}
          </button>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => handleSortChange(e.target.value as SortType)}
            aria-label="Sort"
          >
            <option value="random">Rand</option>
            <option value="size">Size</option>
            <option value="az">A–Z</option>
            <option value="date">Date</option>
          </select>
          <input
            className={styles.search}
            type="search"
            placeholder="Search"
            value={search}
            onChange={(e) => {
              const v = e.target.value
              setSearch(v)
              if (debounceTimer.current) clearTimeout(debounceTimer.current)
              debounceTimer.current = setTimeout(() => {
                setDebouncedSearch(v)
                setShuffleId(null)
                window.scrollTo(0, 0)
              }, 400)
            }}
            aria-label="Search"
          />
          {presets && (
            <select
              className={styles.presetSelect}
              value={activePreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              aria-label="Active preset"
            >
              {presets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className={styles.settingsBtn} onClick={() => dispatchModal({ type: 'open' })} aria-label="Settings">
            ⚙
          </button>
        </div>

        <div ref={galleryRef} className={styles.gallery} data-testid="gallery">
          {loadedBlocks.map((block) => (
            <Block
              key={block.index}
              block={block}
              onTileClick={handleTileClick}
              galleryWidthPx={galleryWidthPx}
              tileCropMaxX={tileCropMaxX}
              tileCropMaxY={tileCropMaxY}
              showTileTitle={showTileTitle}
            />
          ))}

          {showSkeleton && <SkeletonBlock />}

          {isEmpty && (
            <div className={styles.centerText} data-testid="gallery-empty">
              No results
            </div>
          )}

          {!allLoaded && !isError && !isFetching && (
            <div ref={sentinelRef} className={styles.sentinel} />
          )}

          {allLoaded && !isEmpty && (
            <div ref={sentinelRef} className={styles.centerText} data-testid="gallery-end">
              ({totalMedia} results)
            </div>
          )}
        </div>

        {presets && (
          <SettingsModal
            key={modalState.key}
            open={modalState.open}
            onOpenChange={handleModalOpenChange}
            presets={presets}
            activePreset={activePreset}
            onPresetsUpdate={(updated) => {
            const currentPreset = presets?.find((p) => p.name === activePreset)
            const newPreset = updated.find((p) => p.name === activePreset)
            if (currentPreset && newPreset && JSON.stringify(currentPreset) !== JSON.stringify(newPreset)) {
              shuffleIdRef.current = null
              setShuffleId(null)
              queryClient.resetQueries({ queryKey: ["blocks", debouncedSearch, activePreset] })
            }
            queryClient.setQueryData(["presets"], updated)
          }}
          />
        )}

        <Toast.Root
          className={styles.toast}
          open={toastState.open}
          onOpenChange={(o) => { if (!o) dispatchToast({ type: 'hide' }) }}
          duration={5000}
        >
          <Toast.Title className={styles.toastTitle}>{toastState.message}</Toast.Title>
        </Toast.Root>
        <Toast.Viewport className={styles.toastViewport} />

        {shuffleId !== null && (
          <Player
            key={playerState.sessionKey}
            open={playerState.open}
            initialIndex={playerState.index}
            shuffleId={shuffleId}
            onClose={() => dispatchPlayer({ type: 'close' })}
            onShowToast={handleShowToast}
            onShuffleExpired={handleShuffleExpired}
            forwardPreloadCount={forwardPreloadCount}
            backwardPreloadCount={backwardPreloadCount}
            oneFileAtATime={oneFileAtATime}
            playerCropMaxX={playerCropMaxX}
            playerCropMaxY={playerCropMaxY}
            rewindSeconds={rewindSeconds}
            fastForwardSeconds={fastForwardSeconds}
          />
        )}
    </Toast.Provider>
  )
}
