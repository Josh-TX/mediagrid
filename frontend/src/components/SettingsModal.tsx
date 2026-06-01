import * as Dialog from "@radix-ui/react-dialog"
import * as Tabs from "@radix-ui/react-tabs"
import * as ToggleGroup from "@radix-ui/react-toggle-group"
import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Preset } from "@repo/types"
import {
  putPresets, putTempPresets, fetchTasks, postScan, postClean, cancelTask,
  fetchPreviewSettings, postGenThumbnails, postGenHighlights,
} from "../api/media"
import styles from "./SettingsModal.module.css"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  presets: readonly Preset[]
  permanentPresets: readonly Preset[]
  sessionId: string | null
  activePreset: string
  onSavePermanently: () => void
  onSaveTemporarily: (newSessionId: string, presets: Preset[]) => void
  onResetTemp: () => void
}

const ASPECT_RATIO_OPTIONS: { label: string; value: number | null }[] = [
  { label: "No limit", value: null },
  { label: "Very landscape (2/1)", value: 2.0 },
  { label: "Slightly landscape (4/3)", value: 1.33 },
  { label: "Square (1/1)", value: 1.0 },
  { label: "Slightly portrait (3/4)", value: 0.75 },
  { label: "Very portrait (1/2)", value: 0.5 },
]

const CROP_OPTIONS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]

function writeUrlPreset(name: string, push: boolean) {
  const params = new URLSearchParams(window.location.search)
  if (name === "default") {
    params.delete("preset")
  } else {
    params.set("preset", name)
  }
  const qs = params.toString()
  const url = qs ? `?${qs}` : window.location.pathname
  if (push) history.pushState(null, "", url)
  else history.replaceState(null, "", url)
}

function timeAgo(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000)
  if (secs < 60) return `${secs}s ago`
  return `${Math.floor(secs / 60)}m ago`
}

function humanDuration(ms: number): string {
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

// ---- NumberInput ----

function NumberInput({ value, min, className, onChange, id, "aria-label": ariaLabel }: { value: number; min?: number; className?: string | undefined; onChange: (n: number) => void; id?: string; "aria-label"?: string }) {
  const [str, setStr] = useState(String(value))
  return (
    <input
      id={id}
      type="number"
      className={className}
      value={str}
      aria-label={ariaLabel}
      onChange={(e) => setStr(e.target.value)}
      onBlur={() => {
        const n = min !== undefined ? Math.max(min, Number(str) || min) : (Number(str) || 0)
        setStr(String(n))
        onChange(n)
      }}
    />
  )
}

function NullableNumberInput({ value, min, className, onChange, id, "aria-label": ariaLabel }: { value: number | null; min?: number; className?: string | undefined; onChange: (n: number | null) => void; id?: string; "aria-label"?: string }) {
  const [str, setStr] = useState(value === null ? "" : String(value))
  return (
    <input
      id={id}
      type="number"
      className={className}
      value={str}
      placeholder="No limit"
      aria-label={ariaLabel}
      onChange={(e) => setStr(e.target.value)}
      onBlur={() => {
        if (str === "") { onChange(null); return }
        const n = min !== undefined ? Math.max(min, Number(str) || min) : (Number(str) || 0)
        setStr(String(n))
        onChange(n)
      }}
    />
  )
}

// ---- Presets Tab ----

interface PresetsTabProps {
  localPresets: Preset[]
  isDirty: boolean
  isTempSaving: boolean
  isTemp: boolean
  selectedName: string
  saveError: boolean
  onSelectChange: (name: string) => void
  onRename: () => void
  onNewPreset: () => void
  onDelete: () => void
  onUpdatePreset: (patch: Partial<Preset>) => void
  onSavePermanently: () => Promise<boolean>
  onReset: () => void
  onClose: () => void
}

function PresetsTab({
  localPresets,
  isDirty,
  isTempSaving,
  isTemp,
  selectedName,
  saveError,
  onSelectChange,
  onRename,
  onNewPreset,
  onDelete,
  onUpdatePreset,
  onSavePermanently,
  onReset,
  onClose,
}: PresetsTabProps) {
  const selectedPreset = localPresets.find((p) => p.name === selectedName) ?? localPresets[0]
  const isDefault = selectedName === "default"
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [resetKey, setResetKey] = useState(0)

  function showConfirm(msg: string) {
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmMsg(msg)
    confirmTimer.current = setTimeout(() => setConfirmMsg(null), 2000)
  }

  async function handleSaveClick() {
    const ok = await onSavePermanently()
    if (ok) showConfirm("Saved")
  }

  function handleRevertClick() {
    onReset()
    setResetKey(k => k + 1)
    showConfirm("Presets reverted")
  }

  if (!selectedPreset) return null

  return (
    <div className={styles.presetsTab}>
      <div className={styles.presetHeader}>
        <select
          className={styles.presetHeaderSelect}
          value={selectedName}
          onChange={(e) => onSelectChange(e.target.value)}
          aria-label="Select preset"
        >
          {localPresets.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        <button type="button" className={styles.iconBtn} onClick={onRename} disabled={isDefault}>Rename</button>
        <button type="button" className={styles.iconBtn} onClick={onDelete} disabled={isDefault}>Delete</button>
        <button type="button" className={styles.iconBtn} onClick={onNewPreset}>New Preset</button>
      </div>

      <div className={styles.settingsScroll}>
        <fieldset className={styles.section}>
          <legend className={styles.sectionLabel}>Gallery</legend>
          <label className={styles.field} htmlFor="targetTilePercent">
            <span>Target tile % of screen</span>
            <NumberInput key={`${selectedName}-${resetKey}-targetTilePercent`} id="targetTilePercent" className={styles.numberInput} value={selectedPreset.targetTilePercent} min={1} aria-label="Target tile % of screen" onChange={(n) => onUpdatePreset({ targetTilePercent: n })} />
          </label>
          <label className={styles.field} htmlFor="maxTilePercent">
            <span>Max tile % of screen</span>
            <NumberInput key={`${selectedName}-${resetKey}-maxTilePercent`} id="maxTilePercent" className={styles.numberInput} value={selectedPreset.maxTilePercent} min={1} aria-label="Max tile % of screen" onChange={(n) => onUpdatePreset({ maxTilePercent: n })} />
          </label>
          <label className={styles.field}>
            <span>Aspect Ratio Clusters</span>
            <select value={selectedPreset.clusterCount} onChange={(e) => onUpdatePreset({ clusterCount: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {(
            [
              ["tileCropMaxX", "Tile crop X"],
              ["tileCropMaxY", "Tile crop Y"],
            ] as [keyof Preset, string][]
          ).map(([field, label]) => (
            <label key={field} className={styles.field}>
              <span>{label}</span>
              <select value={selectedPreset[field] as number} onChange={(e) => onUpdatePreset({ [field]: Number(e.target.value) })}>
                {CROP_OPTIONS.map((v) => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
              </select>
            </label>
          ))}
          <label className={styles.field}>
            <span>Default sort</span>
            <select value={selectedPreset.defaultSort} onChange={(e) => onUpdatePreset({ defaultSort: e.target.value as Preset["defaultSort"] })}>
              <option value="random">Random</option>
              <option value="size">Size</option>
              <option value="az">A–Z</option>
              <option value="date">Date</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Grid gaps</span>
            <select value={selectedPreset.galleryGap} onChange={(e) => onUpdatePreset({ galleryGap: Number(e.target.value) as Preset["galleryGap"] })}>
              <option value={2}>2px</option>
              <option value={1}>1px</option>
              <option value={0}>0</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Show tile title</span>
            <input
              type="checkbox"
              aria-label="Show tile title"
              checked={selectedPreset.showTileTitle}
              onChange={(e) => onUpdatePreset({ showTileTitle: e.target.checked })}
            />
          </label>
        </fieldset>

        <fieldset className={styles.section}>
          <legend className={styles.sectionLabel}>Filter</legend>
          <label className={styles.field}>
            <span>Media type</span>
            <select value={selectedPreset.mediaType} onChange={(e) => onUpdatePreset({ mediaType: e.target.value as Preset["mediaType"] })}>
              <option value="all">All</option>
              <option value="images">Images only</option>
              <option value="videos">Videos only</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Min aspect ratio</span>
            <select value={selectedPreset.minAspectRatio ?? ""} onChange={(e) => onUpdatePreset({ minAspectRatio: e.target.value === "" ? null : Number(e.target.value) })}>
              {ASPECT_RATIO_OPTIONS.map((o) => <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Max aspect ratio</span>
            <select value={selectedPreset.maxAspectRatio ?? ""} onChange={(e) => onUpdatePreset({ maxAspectRatio: e.target.value === "" ? null : Number(e.target.value) })}>
              {ASPECT_RATIO_OPTIONS.map((o) => <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>)}
            </select>
          </label>
          <label className={styles.field}>
            <span>Min duration (s)</span>
            <NullableNumberInput key={`${selectedName}-${resetKey}-minDuration`} aria-label="Min duration (s)" className={styles.numberInput} value={selectedPreset.minDuration} min={0} onChange={(n) => onUpdatePreset({ minDuration: n })} />
          </label>
          <label className={styles.field}>
            <span>Max duration (s)</span>
            <NullableNumberInput key={`${selectedName}-${resetKey}-maxDuration`} aria-label="Max duration (s)" className={styles.numberInput} value={selectedPreset.maxDuration} min={0} onChange={(n) => onUpdatePreset({ maxDuration: n })} />
          </label>
          <label className={styles.field}>
            <span>Exclude contains</span>
            <input type="text" aria-label="Exclude contains" className={styles.textInput} value={selectedPreset.excludeContainsCsv ?? ""} placeholder="term1,term2" onChange={(e) => onUpdatePreset({ excludeContainsCsv: e.target.value || null })} />
          </label>
          <label className={styles.field}>
            <span>Exclude not contains</span>
            <input type="text" aria-label="Exclude not contains" className={styles.textInput} value={selectedPreset.excludeNotContainsCsv ?? ""} placeholder="term1,term2" onChange={(e) => onUpdatePreset({ excludeNotContainsCsv: e.target.value || null })} />
          </label>
        </fieldset>

        <fieldset className={styles.section}>
          <legend className={styles.sectionLabel}>Playback</legend>
          <label className={styles.field}>
            <span>One file at a time</span>
            <input
              type="checkbox"
              aria-label="One file at a time"
              checked={selectedPreset.oneFileAtATime}
              onChange={(e) => onUpdatePreset({ oneFileAtATime: e.target.checked })}
            />
          </label>
          {selectedPreset.oneFileAtATime ? (
            <>
              <div className={styles.field}>
                <span>Forward preload</span>
                <span>1</span>
              </div>
              <div className={styles.field}>
                <span>Backward preload</span>
                <span>1</span>
              </div>
            </>
          ) : (
            <>
              <label className={styles.field}>
                <span>Forward preload</span>
                <select value={selectedPreset.forwardPreloadCount} onChange={(e) => onUpdatePreset({ forwardPreloadCount: Number(e.target.value) })}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Backward preload</span>
                <select value={selectedPreset.backwardPreloadCount} onChange={(e) => onUpdatePreset({ backwardPreloadCount: Number(e.target.value) })}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </>
          )}
          {(
            [
              ["playerCropMaxX", "Player crop X"],
              ["playerCropMaxY", "Player crop Y"],
            ] as [keyof Preset, string][]
          ).map(([field, label]) => (
            <label key={field} className={styles.field}>
              <span>{label}</span>
              <select value={selectedPreset[field] as number} onChange={(e) => onUpdatePreset({ [field]: Number(e.target.value) })}>
                {CROP_OPTIONS.map((v) => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
              </select>
            </label>
          ))}
          <label className={styles.field}>
            <span>When video ends</span>
            <select value={selectedPreset.videoEndBehavior} onChange={(e) => onUpdatePreset({ videoEndBehavior: e.target.value as "loop" | "stop" | "next" })}>
              <option value="loop">Loop</option>
              <option value="stop">Stop</option>
              <option value="next">Next</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Rewind seconds</span>
            <NumberInput key={`${selectedName}-${resetKey}-rewindSeconds`} aria-label="Rewind seconds" className={styles.numberInput} value={selectedPreset.rewindSeconds} min={1} onChange={(n) => onUpdatePreset({ rewindSeconds: n })} />
          </label>
          <label className={styles.field}>
            <span>Fast-forward seconds</span>
            <NumberInput key={`${selectedName}-${resetKey}-fastForwardSeconds`} aria-label="Fast-forward seconds" className={styles.numberInput} value={selectedPreset.fastForwardSeconds} min={1} onChange={(n) => onUpdatePreset({ fastForwardSeconds: n })} />
          </label>
        </fieldset>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.closeBtn} onClick={onClose} disabled={isTempSaving}>{isTempSaving ? "Saving…" : "Close"}</button>
        <div className={styles.footerRight}>
          {confirmMsg ? (
            <span className={styles.confirmMsg}>{confirmMsg}</span>
          ) : (
            <>
              {saveError && <span className={styles.saveError}>Save failed</span>}
              <button type="button" className={styles.closeBtn} onClick={handleRevertClick} disabled={!isDirty && !isTemp}>Revert</button>
              <button type="button" className={styles.closeBtn} onClick={() => void handleSaveClick()}>Save Permanently</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function taskLabel(type: string): string {
  if (type === "scan") return "Scan"
  if (type === "clean") return "Clean"
  if (type === "gen-thumbnails") return "Gen-Thumbnails"
  if (type === "gen-highlights") return "Gen-Highlights"
  return type
}

// ---- Tasks Tab ----

function TasksTab({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [cleanMsg, setCleanMsg] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)

  const { data: state } = useQuery({
    queryKey: ["tasks"],
    queryFn: fetchTasks,
    refetchInterval: (query) => {
      const d = query.state.data
      return d && (d.active !== null || d.queue.length > 0) ? 1000 : false
    },
  })

  async function handleScan() {
    setScanMsg(null)
    const result = await postScan()
    if (result === null) {
      setScanMsg("Scan already queued")
    } else {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] })
    }
  }

  async function handleClean() {
    setCleanMsg(null)
    const result = await postClean()
    if (result === null) {
      setCleanMsg("Clean already queued")
    } else {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] })
    }
  }

  async function handleClose(id: number) {
    await cancelTask(id)
    await queryClient.invalidateQueries({ queryKey: ["tasks"] })
  }

  const active = state?.active ?? null
  const queue = state?.queue ?? []
  const recent = state?.recent ?? []

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={styles.tasksTab}>
      <div className={styles.taskActions}>
        <button type="button" className={styles.taskBtn} onClick={handleScan}>Run Scan</button>
        {scanMsg && <span className={styles.inlineMsg}>{scanMsg}</span>}
        <button type="button" className={styles.taskBtn} onClick={handleClean}>Run Clean</button>
        {cleanMsg && <span className={styles.inlineMsg}>{cleanMsg}</span>}
      </div>

      <div className={styles.taskSection}>
        <div className={styles.taskSectionHeader}>Active Task</div>
        {active === null ? (
          <div className={styles.taskEmpty}>No active task</div>
        ) : (
          <div className={styles.taskItem}>
            <span className={styles.taskType}>{taskLabel(active.type)}</span>
            <span className={styles.taskElapsed}>{Math.floor((now - active.startedAt) / 1000)}s</span>
            <span className={styles.taskStatus}>
              {active.cancelling ? "cancelling…" : active.status}
            </span>
            <button
              type="button"
              className={styles.cancelBtn}
              disabled={active.cancelling}
              onClick={() => handleClose(active.id)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className={styles.taskSection}>
        <div className={styles.taskSectionHeader}>Queue</div>
        {queue.length === 0 ? (
          <div className={styles.taskEmpty}>Queue empty</div>
        ) : (
          queue.map((t) => (
            <div key={t.id} className={styles.taskItem}>
              <span className={styles.taskType}>{taskLabel(t.type)}</span>
              <span className={styles.taskStatus}>{timeAgo(t.enqueuedAt)}</span>
              <button type="button" className={styles.cancelBtn} onClick={() => handleClose(t.id)}>Cancel</button>
            </div>
          ))
        )}
      </div>

      <div className={styles.recentTaskSection}>
        <div className={styles.taskSectionHeader}>Recent Tasks</div>
        <div className={styles.recentTaskList}>
          {recent.length === 0 ? (
            <div className={styles.taskEmpty}>No recent tasks</div>
          ) : (
            recent.map((t) => (
              <div key={t.id} className={styles.recentTaskItem}>
                <div className={styles.recentTaskRow1}>
                  <span className={styles.taskType}>{taskLabel(t.type)}</span>
                  <span className={`${styles.outcomeBadge} ${styles[`outcome_${t.outcome}`]}`}>{t.outcome}</span>
                  <span className={styles.durationBadge}>{humanDuration(t.duration)}</span>
                  <span className={styles.taskStatus}>{timeAgo(t.finishedAt)}</span>
                </div>
                <div className={styles.recentTaskMsg}>{t.message}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.closeBtn} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

// ---- Previews Tab ----

const COMPRESSION_OPTIONS = [
  { value: 20, label: "20 - extreme compression" },
  { value: 25, label: "25 - extreme compression" },
  { value: 30, label: "30 - extreme compression" },
  { value: 35, label: "35 - extreme compression" },
  { value: 40, label: "40 - high compression" },
  { value: 45, label: "45 - high compression" },
  { value: 50, label: "50 - high compression" },
  { value: 55, label: "55 - medium compression" },
  { value: 60, label: "60 - medium compression" },
  { value: 65, label: "65 - medium compression" },
  { value: 70, label: "70 - low compression" },
  { value: 75, label: "75 - low compression" },
  { value: 80, label: "80 - minimal compression" },
]

const RESOLUTION_OPTIONS = [
  { value: 200 * 200, label: "200×200" },
  { value: 300 * 300, label: "300×300" },
  { value: 400 * 400, label: "400×400" },
  { value: 500 * 500, label: "500×500" },
  { value: 600 * 600, label: "600×600" },
  { value: 700 * 700, label: "700×700" },
  { value: 800 * 800, label: "800×800" },
]

interface FilterSectionProps {
  simpleFilter: string
  usePresetFilter: boolean
  presetName: string | null
  presets: readonly Preset[]
  onSimpleFilterChange: (v: string) => void
  onUsePresetFilterChange: (v: boolean) => void
  onPresetNameChange: (v: string) => void
}

function FilterSection({
  simpleFilter,
  usePresetFilter,
  presetName,
  presets,
  onSimpleFilterChange,
  onUsePresetFilterChange,
  onPresetNameChange,
}: FilterSectionProps) {
  return (
    <fieldset className={styles.section}>
      <legend className={styles.sectionLabel}>Filter</legend>
      <label className={styles.field}>
        <span>Search</span>
        <input
          type="text"
          aria-label="Search"
          className={styles.textInput}
          value={simpleFilter}
          placeholder="space-delimited terms"
          onChange={(e) => onSimpleFilterChange(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span>Use preset filter</span>
        <input
          type="checkbox"
          aria-label="Use preset filter"
          checked={usePresetFilter}
          onChange={(e) => onUsePresetFilterChange(e.target.checked)}
        />
      </label>
      {usePresetFilter && (
        <label className={styles.field}>
          <span>Preset</span>
          <select
            value={presetName ?? "default"}
            onChange={(e) => onPresetNameChange(e.target.value)}
          >
            {presets.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  )
}

function PreviewsTab({ presets, sessionId, onClose }: { presets: readonly Preset[]; sessionId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [activeForm, setActiveForm] = useState<string>("thumbnails")

  // Server-synced settings (overwritten on load from server)
  const [form, setForm] = useState({ thumbCompression: 50, thumbResolution: 500 * 500, hlResolution: 500 * 500, hlDuration: 6, hlSegmentCount: 10, hlFfmpegArg: "-c:v libx264 -crf 25 -preset fast" })
  const { thumbCompression, thumbResolution, hlResolution, hlDuration, hlSegmentCount, hlFfmpegArg } = form

  // Thumbnail form state
  const [thumbOverride, setThumbOverride] = useState(false)
  const [thumbSimpleFilter, setThumbSimpleFilter] = useState("")
  const [thumbUsePresetFilter, setThumbUsePresetFilter] = useState(false)
  const [thumbPresetName, setThumbPresetName] = useState<string | null>("default")

  // Highlight form state
  const [hlOverride, setHlOverride] = useState(false)
  const [hlSimpleFilter, setHlSimpleFilter] = useState("")
  const [hlUsePresetFilter, setHlUsePresetFilter] = useState(false)
  const [hlPresetName, setHlPresetName] = useState<string | null>("default")

  const [showQueued, setShowQueued] = useState(false)
  const queuedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: settings } = useQuery({
    queryKey: ["preview-settings"],
    queryFn: fetchPreviewSettings,
  })

  useEffect(() => {
    if (!settings) return
    setForm({ thumbCompression: settings.thumbCompression, thumbResolution: settings.thumbResolution, hlResolution: settings.highlightResolution, hlDuration: settings.highlightDuration, hlSegmentCount: settings.highlightSegmentCount, hlFfmpegArg: settings.highlightFfmpegArg })
  }, [settings])

  async function handleGenerate() {
    try {
      if (activeForm === "thumbnails") {
        await postGenThumbnails({
          compression: thumbCompression,
          resolution: thumbResolution,
          override: thumbOverride,
          simpleFilter: thumbSimpleFilter,
          usePresetFilter: thumbUsePresetFilter,
          presetName: thumbUsePresetFilter ? thumbPresetName : null,
          ...(sessionId ? { sessionId } : {}),
        })
      } else {
        await postGenHighlights({
          resolution: hlResolution,
          override: hlOverride,
          simpleFilter: hlSimpleFilter,
          usePresetFilter: hlUsePresetFilter,
          presetName: hlUsePresetFilter ? hlPresetName : null,
          ...(sessionId ? { sessionId } : {}),
          highlightDuration: hlDuration,
          segmentCount: hlSegmentCount,
          ffmpegArg: hlFfmpegArg,
        })
      }
      await queryClient.invalidateQueries({ queryKey: ["tasks"] })
      if (queuedTimer.current) clearTimeout(queuedTimer.current)
      setShowQueued(true)
      queuedTimer.current = setTimeout(() => setShowQueued(false), 4000)
    } catch {
      // silently ignore; task list will show status
    }
  }

  const segmentDuration = hlSegmentCount > 0 ? (hlDuration / hlSegmentCount).toFixed(2) : "0"

  return (
    <div className={styles.previewsTab}>
      <ToggleGroup.Root
        type="single"
        value={activeForm}
        onValueChange={(v) => { if (v) setActiveForm(v) }}
        className={styles.previewsToggle}
      >
        <ToggleGroup.Item value="thumbnails" className={styles.previewsToggleItem}>Thumbnails</ToggleGroup.Item>
        <ToggleGroup.Item value="highlights" className={styles.previewsToggleItem}>Highlights</ToggleGroup.Item>
      </ToggleGroup.Root>

      {activeForm === "thumbnails" && (
        <div className={styles.settingsScroll}>
          <fieldset className={styles.section}>
            <legend className={styles.sectionLabel}>Thumbnails</legend>
            <label className={styles.field}>
              <span>WebP quality</span>
              <select value={thumbCompression} onChange={(e) => setForm((prev) => ({ ...prev, thumbCompression: Number(e.target.value) }))}>
                {COMPRESSION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Resolution</span>
              <select value={thumbResolution} onChange={(e) => setForm((prev) => ({ ...prev, thumbResolution: Number(e.target.value) }))}>
                {RESOLUTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Override existing</span>
              <input type="checkbox" aria-label="Override existing thumbnails" checked={thumbOverride} onChange={(e) => setThumbOverride(e.target.checked)} />
            </label>
          </fieldset>
          <FilterSection
            simpleFilter={thumbSimpleFilter}
            usePresetFilter={thumbUsePresetFilter}
            presetName={thumbPresetName}
            presets={presets}
            onSimpleFilterChange={setThumbSimpleFilter}
            onUsePresetFilterChange={setThumbUsePresetFilter}
            onPresetNameChange={setThumbPresetName}
          />
        </div>
      )}

      {activeForm === "highlights" && (
        <div className={styles.settingsScroll}>
          <fieldset className={styles.section}>
            <legend className={styles.sectionLabel}>Highlights</legend>
            <label className={styles.field}>
              <span>Resolution</span>
              <select value={hlResolution} onChange={(e) => setForm((prev) => ({ ...prev, hlResolution: Number(e.target.value) }))}>
                {RESOLUTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Override existing</span>
              <input type="checkbox" aria-label="Override existing highlights" checked={hlOverride} onChange={(e) => setHlOverride(e.target.checked)} />
            </label>
            <label className={styles.field}>
              <span>Highlight duration (s)</span>
              <input
                type="number"
                aria-label="Highlight duration (s)"
                className={styles.numberInput}
                value={hlDuration}
                min={0}
                onChange={(e) => setForm((prev) => ({ ...prev, hlDuration: Number(e.target.value) }))}
              />
            </label>
            <label className={styles.field}>
              <span>Segment count</span>
              <input
                type="number"
                aria-label="Segment count"
                className={styles.numberInput}
                value={hlSegmentCount}
                min={1}
                onChange={(e) => setForm((prev) => ({ ...prev, hlSegmentCount: Number(e.target.value) }))}
              />
            </label>
            <label className={styles.field}>
              <span>Segment duration</span>
              <input type="text" aria-label="Segment duration" className={styles.numberInput} readOnly value={`${segmentDuration}s per segment`} />
            </label>
            <label className={styles.field}>
              <span>ffmpeg arg</span>
              <input
                type="text"
                aria-label="ffmpeg arg"
                className={styles.textInput}
                value={hlFfmpegArg}
                onChange={(e) => setForm((prev) => ({ ...prev, hlFfmpegArg: e.target.value }))}
              />
            </label>
          </fieldset>
          <FilterSection
            simpleFilter={hlSimpleFilter}
            usePresetFilter={hlUsePresetFilter}
            presetName={hlPresetName}
            presets={presets}
            onSimpleFilterChange={setHlSimpleFilter}
            onUsePresetFilterChange={setHlUsePresetFilter}
            onPresetNameChange={setHlPresetName}
          />
        </div>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.closeBtn} onClick={onClose}>Close</button>
        <div className={styles.footerRight}>
          {showQueued ? (
            <div className={styles.queuedMsg}>
              <span>Task queued.</span>
              <span>See Tasks tab for status</span>
            </div>
          ) : (
            <button type="button" className={styles.saveBtn} onClick={handleGenerate}>
              {activeForm === "thumbnails" ? "Generate Thumbnails" : "Generate Highlights"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Main Modal ----

export function SettingsModal({
  open,
  onOpenChange,
  presets,
  permanentPresets,
  sessionId,
  activePreset,
  onSavePermanently,
  onSaveTemporarily,
  onResetTemp,
}: SettingsModalProps) {
  const [localPresets, setLocalPresets] = useState<Preset[]>(() => [...presets])
  const localPresetsRef = useRef<Preset[]>(localPresets)
  const [selectedName, setSelectedName] = useState(activePreset)
  const [saveError, setSaveError] = useState(false)
  const [activeTab, setActiveTab] = useState("presets")
  const [baselineJson, setBaselineJson] = useState(() => JSON.stringify(presets))
  const isDirty = JSON.stringify(localPresets) !== baselineJson

  function updateSelectedPreset(patch: Partial<Preset>) {
    const next = localPresetsRef.current.map((p) => (p.name === selectedName ? { ...p, ...patch } : p))
    localPresetsRef.current = next
    setLocalPresets(next)
  }

  function handleSelectChange(name: string) {
    setSelectedName(name)
    writeUrlPreset(name, true)
  }

  function handleRename() {
    const newName = prompt("New name for preset:")
    if (!newName?.trim()) return
    const trimmed = newName.trim()
    if (localPresets.some((p) => p.name.toLowerCase() === trimmed.toLowerCase() && p.name !== selectedName)) {
      alert(`A preset named "${trimmed}" already exists.`)
      return
    }
    setLocalPresets((prev) =>
      prev.map((p) => (p.name === selectedName ? { ...p, name: trimmed } : p)),
    )
    setSelectedName(trimmed)
    writeUrlPreset(trimmed, false)
  }

  function handleNewPreset() {
    const newName = prompt("Name for the new preset:")
    if (!newName?.trim()) return
    const trimmed = newName.trim()
    if (localPresets.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      alert(`A preset named "${trimmed}" already exists.`)
      return
    }
    const defaultPreset = localPresets.find((p) => p.name.toLowerCase() === "default") ?? localPresets[0]
    if (!defaultPreset) return
    const copy: Preset = { ...defaultPreset, name: trimmed }
    setLocalPresets((prev) => [...prev, copy])
    setSelectedName(trimmed)
    writeUrlPreset(trimmed, true)
  }

  function handleDelete() {
    setLocalPresets((prev) => prev.filter((p) => p.name !== selectedName))
    setSelectedName("default")
    writeUrlPreset("default", true)
  }

  const isSavingRef = useRef(false)
  const [isTempSaving, setIsTempSaving] = useState(false)
  const isTempSavingRef = useRef(false)

  async function handleSavePermanently(): Promise<boolean> {
    isSavingRef.current = true
    setSaveError(false)
    try {
      await putPresets(localPresets)
      onSavePermanently()
      setBaselineJson(JSON.stringify(localPresets))
      return true
    } catch {
      setSaveError(true)
      return false
    } finally {
      isSavingRef.current = false
    }
  }

  function handleReset() {
    const next = [...permanentPresets]
    localPresetsRef.current = next
    setLocalPresets(next)
    setBaselineJson(JSON.stringify(permanentPresets))
    if (sessionId !== null) {
      onResetTemp()
    }
    const nameExists = permanentPresets.some((p) => p.name === selectedName)
    if (!nameExists) {
      setSelectedName("default")
      writeUrlPreset("default", true)
    }
  }

  async function handleTabChange(newTab: string) {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    const latestPresets = localPresetsRef.current
    const latestDirty = JSON.stringify(latestPresets) !== baselineJson
    if (activeTab === "presets" && newTab !== "presets" && latestDirty && !isTempSavingRef.current && !isSavingRef.current) {
      isTempSavingRef.current = true
      setIsTempSaving(true)
      try {
        const result = await putTempPresets(latestPresets, sessionId)
        onSaveTemporarily(result.sessionId, latestPresets)
      } catch {
        // auto-save failed; switch tabs anyway
      } finally {
        isTempSavingRef.current = false
        setIsTempSaving(false)
      }
    }
    setActiveTab(newTab)
  }

  async function handleClose() {
    if (isTempSavingRef.current) return
    if (!isSavingRef.current) {
      const latestPresets = localPresetsRef.current
      const latestDirty = JSON.stringify(latestPresets) !== baselineJson
      if (latestDirty) {
        isTempSavingRef.current = true
        setIsTempSaving(true)
        try {
          const result = await putTempPresets(latestPresets, sessionId)
          onSaveTemporarily(result.sessionId, latestPresets)
        } catch {
          // auto-save failed; close anyway
        } finally {
          isTempSavingRef.current = false
          setIsTempSaving(false)
        }
      } else if (sessionId !== null) {
        onResetTemp()
      }
    }
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => { e.preventDefault(); void handleClose() }}
        >
          <Dialog.Title className={styles.srOnly}>Settings</Dialog.Title>
          <Dialog.Description className={styles.srOnly}>Configure presets and tasks</Dialog.Description>
          <button type="button" className={styles.close} aria-label="Close" onClick={() => void handleClose()}>✕</button>
          <Tabs.Root value={activeTab} onValueChange={(v) => void handleTabChange(v)} className={styles.tabsRoot}>
            <Tabs.List className={styles.tabList}>
              <Tabs.Trigger className={styles.tab} value="presets">Presets</Tabs.Trigger>
              <Tabs.Trigger className={styles.tab} value="tasks">Tasks</Tabs.Trigger>
              <Tabs.Trigger className={styles.tab} value="previews">Previews</Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content className={styles.tabPanel} value="presets">
              <PresetsTab
                localPresets={localPresets}
                isDirty={isDirty}
                isTempSaving={isTempSaving}
                isTemp={sessionId !== null}
                selectedName={selectedName}
                saveError={saveError}
                onSelectChange={handleSelectChange}
                onRename={handleRename}
                onNewPreset={handleNewPreset}
                onDelete={handleDelete}
                onUpdatePreset={updateSelectedPreset}
                onSavePermanently={handleSavePermanently}
                onReset={handleReset}
                onClose={handleClose}
              />
            </Tabs.Content>

            <Tabs.Content className={styles.tabPanel} value="tasks">
              {activeTab === "tasks" && open && <TasksTab onClose={() => void handleClose()} />}
            </Tabs.Content>

            <Tabs.Content className={styles.tabPanel} value="previews">
              {activeTab === "previews" && open && <PreviewsTab presets={presets} sessionId={sessionId} onClose={() => void handleClose()} />}
            </Tabs.Content>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
