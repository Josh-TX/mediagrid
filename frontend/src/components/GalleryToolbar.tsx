import styles from "./Gallery.module.css"

export type SortType = "random" | "size" | "az" | "date"
export type SortDir = "asc" | "desc"

interface GalleryToolbarProps {
  sort: SortType
  dir: SortDir
  search: string
  presets: readonly { name: string }[] | undefined
  activePreset: string
  onSortDirAction: () => void
  onSortChange: (sort: SortType) => void
  onSearchChange: (value: string) => void
  onPresetChange: (name: string) => void
  onSettingsOpen: () => void
}

export function GalleryToolbar({
  sort, dir, search, presets, activePreset,
  onSortDirAction, onSortChange, onSearchChange, onPresetChange, onSettingsOpen,
}: GalleryToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <button
        type="button"
        className={styles.sortDirBtn}
        onClick={onSortDirAction}
        aria-label={sort === "random" ? "Re-shuffle" : dir === "asc" ? "Sort ascending" : "Sort descending"}
        title={sort === "random" ? "Re-shuffle" : dir === "asc" ? "Ascending" : "Descending"}
      >
        {sort === "random" ? "↺" : dir === "asc" ? "↑" : "↓"}
      </button>
      <select
        className={styles.sortSelect}
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortType)}
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
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="Search"
      />
      {presets && (
        <select
          className={styles.presetSelect}
          value={activePreset}
          onChange={(e) => onPresetChange(e.target.value)}
          aria-label="Active preset"
        >
          {presets.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <button type="button" className={styles.settingsBtn} onClick={onSettingsOpen} aria-label="Settings">
        ⚙
      </button>
    </div>
  )
}
