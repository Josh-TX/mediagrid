import * as Toast from "@radix-ui/react-toast"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react"
import { fetchBlocks, fetchPresets } from "../api/media"
import { SettingsModal } from "./SettingsModal"
import { Player } from "./Player"
import { Block, SkeletonBlock } from "./GalleryBlock"
import { GalleryToolbar, type SortType, type SortDir } from "./GalleryToolbar"
import styles from "./Gallery.module.css"

function readUrlParams() {
  const params = new URLSearchParams(window.location.search)
  const sortRaw = params.get("sort") ?? "random"
  const sort: SortType = (sortRaw === "size" || sortRaw === "az" || sortRaw === "date") ? sortRaw : "random"
  const dirRaw = params.get("dir") ?? "asc"
  const dir: SortDir = dirRaw === "desc" ? "desc" : "asc"
  const iRaw = params.get("i")
  return {
    q: params.get("q") ?? "",
    preset: params.get("preset") ?? "default",
    s: params.get("s") !== null ? Number(params.get("s")) : null,
    sort,
    dir,
    i: iRaw !== null ? Number(iRaw) : null,
  }
}

function buildUrl(q: string, preset: string, shuffleId: number | null, sort: SortType, dir: SortDir, playerIndex: number | null): string {
  const params = new URLSearchParams()
  if (q.trim()) params.set("q", q.trim())
  if (preset !== "default") params.set("preset", preset)
  if (sort !== "random") params.set("sort", sort)
  if (dir !== "asc") params.set("dir", dir)
  if (shuffleId !== null) params.set("s", String(shuffleId))
  if (playerIndex !== null) params.set("i", String(playerIndex))
  const qs = params.toString()
  return qs ? `?${qs}` : window.location.pathname
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
  const [sessionId, setSessionId] = useState<string | null>(() => sessionStorage.getItem("presetSessionId"))

  const { data: presetsData, isError: presetsError } = useQuery({
    queryKey: ["presets", sessionId],
    queryFn: () => fetchPresets(sessionId ?? undefined),
  })
  const presets = presetsData?.presets
  const isTemp = presetsData?.isTemp ?? false

  // When the server no longer recognizes the sessionId (e.g. after restart), clear it.
  useEffect(() => {
    if (presetsData && !presetsData.isTemp && sessionId !== null) {
      sessionStorage.removeItem("presetSessionId")
      setSessionId(null)
    }
  }, [presetsData?.isTemp])

  const initialParams = useMemo(() => readUrlParams(), [])
  const [search, setSearch] = useState(initialParams.q)
  const [debouncedSearch, setDebouncedSearch] = useState(initialParams.q)
  const [activePreset, setActivePreset] = useState(initialParams.preset)
  const [shuffleId, setShuffleId] = useState<number | null>(initialParams.s)
  const [sort, setSort] = useState<SortType>(initialParams.sort)
  const [dir, setDir] = useState<SortDir>(initialParams.dir)
  const [toastState, dispatchToast] = useReducer(toastReducer, { open: false, message: '' })
  const [playerState, dispatchPlayer] = useReducer(playerReducer, {
    open: initialParams.s !== null && initialParams.i !== null,
    index: initialParams.i ?? 0,
    sessionKey: 0,
  })
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

  // Always-current refs for values read inside setTimeout callbacks.
  const latestPresetRef = useRef(activePreset)
  latestPresetRef.current = activePreset
  const latestSortRef = useRef(sort)
  latestSortRef.current = sort
  const latestDirRef = useRef(dir)
  latestDirRef.current = dir

  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }, [])

  // Popstate: sync React state from URL when the user navigates back/forward.
  useEffect(() => {
    function handlePopState() {
      if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null }
      const p = readUrlParams()
      // Set ref immediately so the queryFn reads the correct shuffleId before React re-renders.
      shuffleIdRef.current = p.s
      setSearch(p.q)
      setDebouncedSearch(p.q)
      setActivePreset(p.preset)
      setShuffleId(p.s)
      setSort(p.sort)
      setDir(p.dir)
      if (p.i !== null) dispatchPlayer({ type: 'open', index: p.i })
      else dispatchPlayer({ type: 'close' })
      // Reset cached data so the gallery refetches with the restored shuffleId.
      queryClient.resetQueries({ queryKey: ["blocks", p.q, p.preset, p.sort, p.dir] })
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

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
        const res = await fetchBlocks(shuffleIdRef.current, pageParam, debouncedSearch, activePreset, sort, dir, sessionId ?? undefined)
        if (shuffleIdRef.current === null) {
          setShuffleId(res.shuffleId)
          history.replaceState(null, "", buildUrl(debouncedSearch, activePreset, res.shuffleId, sort, dir, null))
        }
        return res
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) handleShuffleExpired()
        else dispatchToast({ type: 'show', message: "Failed to load media" })
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
    shuffleIdRef.current = null
    setShuffleId(null)
    dispatchPlayer({ type: 'close' })
    history.replaceState(null, "", buildUrl(debouncedSearch, activePreset, null, sort, dir, null))
    queryClient.resetQueries({ queryKey: ["blocks", debouncedSearch, activePreset, sort, dir] })
  }

  function handleTileClick(shuffleIndex: number) {
    dispatchPlayer({ type: 'open', index: shuffleIndex })
    history.pushState(null, "", buildUrl(debouncedSearch, activePreset, shuffleId, sort, dir, shuffleIndex))
  }

  function handleShowToast(message: string) {
    dispatchToast({ type: 'show', message })
  }

  const canFetchNext = hasNextPage && shuffleId !== null

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !canFetchNext || isFetching) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) fetchNextPage() },
      { rootMargin: "200px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [canFetchNext, isFetching, fetchNextPage, data?.pages.length])

  function handlePresetChange(name: string) {
    shuffleIdRef.current = null
    setActivePreset(name)
    setShuffleId(null)
    history.pushState(null, "", buildUrl(debouncedSearch, name, null, sort, dir, null))
    window.scrollTo(0, 0)
    queryClient.resetQueries({ queryKey: ["blocks", debouncedSearch, name, sort, dir] })
  }

  function handleReshuffle() {
    shuffleIdRef.current = null
    setShuffleId(null)
    history.pushState(null, "", buildUrl(debouncedSearch, activePreset, null, sort, dir, null))
    window.scrollTo(0, 0)
    queryClient.resetQueries({ queryKey: ["blocks", debouncedSearch, activePreset, sort, dir] })
  }

  function handleSortChange(newSort: SortType) {
    shuffleIdRef.current = null
    const newDir = newSort !== "random" && sort === "random" ? "asc" : dir
    setSort(newSort)
    setShuffleId(null)
    if (newSort !== "random" && sort === "random") setDir("asc")
    history.pushState(null, "", buildUrl(debouncedSearch, activePreset, null, newSort, newDir, null))
    window.scrollTo(0, 0)
  }

  function handleDirToggle() {
    shuffleIdRef.current = null
    const newDir = dir === "asc" ? "desc" : "asc"
    setDir(newDir)
    setShuffleId(null)
    history.pushState(null, "", buildUrl(debouncedSearch, activePreset, null, sort, newDir, null))
    window.scrollTo(0, 0)
  }

  function handleSearchChange(v: string) {
    setSearch(v)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(v)
      setShuffleId(null)
      history.pushState(null, "", buildUrl(v, latestPresetRef.current, null, latestSortRef.current, latestDirRef.current, null))
      window.scrollTo(0, 0)
    }, 400)
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
      <GalleryToolbar
        sort={sort}
        dir={dir}
        search={search}
        presets={presets}
        activePreset={activePreset}
        onSortDirAction={sort === "random" ? handleReshuffle : handleDirToggle}
        onSortChange={handleSortChange}
        onSearchChange={handleSearchChange}
        onPresetChange={handlePresetChange}
        onSettingsOpen={() => dispatchModal({ type: 'open' })}
      />

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
          key={`modal-${modalState.key}`}
          open={modalState.open}
          onOpenChange={handleModalOpenChange}
          presets={presets}
          isTemp={isTemp}
          sessionId={sessionId}
          activePreset={activePreset}
          onSavePermanently={(updated) => {
            const currentPreset = presets?.find((p) => p.name === activePreset)
            const newPreset = updated.find((p) => p.name === activePreset)
            if (currentPreset && newPreset && JSON.stringify(currentPreset) !== JSON.stringify(newPreset)) {
              shuffleIdRef.current = null
              setShuffleId(null)
              queryClient.resetQueries({ queryKey: ["blocks", debouncedSearch, activePreset, sort, dir] })
            }
            sessionStorage.removeItem("presetSessionId")
            setSessionId(null)
          }}
          onSaveTemporarily={(updated, newSessionId) => {
            const currentPreset = presets?.find((p) => p.name === activePreset)
            const newPreset = updated.find((p) => p.name === activePreset)
            if (currentPreset && newPreset && JSON.stringify(currentPreset) !== JSON.stringify(newPreset)) {
              shuffleIdRef.current = null
              setShuffleId(null)
              queryClient.resetQueries({ queryKey: ["blocks", debouncedSearch, activePreset, sort, dir] })
            }
            sessionStorage.setItem("presetSessionId", newSessionId)
            setSessionId(newSessionId)
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
          key={`player-${playerState.sessionKey}`}
          open={playerState.open}
          initialIndex={playerState.index}
          shuffleId={shuffleId}
          onClose={() => {
            dispatchPlayer({ type: 'close' })
            history.pushState(null, "", buildUrl(debouncedSearch, activePreset, shuffleId, sort, dir, null))
          }}
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
