/** Encodes a file path for use in a URL, encoding each segment but preserving slashes. */
export function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/")
}

import { Schema } from "@effect/schema"
import { Effect } from "effect"
import { BlockResponse, MediaInfo, Preset, PreviewSettings, TasksResponse } from "@repo/types"

export async function fetchPresets(sessionId?: string): Promise<{ presets: readonly Preset[]; isTemp: boolean }> {
  const params = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""
  const res = await fetch(`/api/presets${params}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json = (await res.json()) as { presets: unknown; isTemp: boolean }
  const presets = Effect.runSync(Schema.decodeUnknown(Schema.Array(Preset))(json.presets))
  return { presets, isTemp: json.isTemp }
}

export async function putPresets(presets: Preset[]): Promise<void> {
  const res = await fetch("/api/presets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(presets),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
}

export async function putTempPresets(presets: Preset[], sessionId: string | null): Promise<{ sessionId: string }> {
  const res = await fetch("/api/presets/temp", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ presets, sessionId: sessionId ?? undefined }),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return (await res.json()) as { sessionId: string }
}

export async function fetchTasks(): Promise<typeof TasksResponse.Type> {
  const res = await fetch("/api/tasks")
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json: unknown = await res.json()
  return Effect.runSync(Schema.decodeUnknown(TasksResponse)(json))
}

/** Returns the task id, or null if a task of that type is already active/queued (409). */
export async function postScan(): Promise<{ id: number } | null> {
  const res = await fetch("/api/tasks/scan", { method: "POST" })
  if (res.status === 409) return null
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json = (await res.json()) as { id: number }
  return json
}

/** Returns the task id, or null if a task of that type is already active/queued (409). */
export async function postClean(): Promise<{ id: number } | null> {
  const res = await fetch("/api/tasks/clean", { method: "POST" })
  if (res.status === 409) return null
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json = (await res.json()) as { id: number }
  return json
}

export async function cancelTask(id: number): Promise<void> {
  const res = await fetch(`/api/tasks/${id}/cancel`, { method: "POST" })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
}

export async function fetchPreviewSettings(): Promise<typeof PreviewSettings.Type> {
  const res = await fetch("/api/preview-settings")
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json: unknown = await res.json()
  return Effect.runSync(Schema.decodeUnknown(PreviewSettings)(json))
}

export interface GenThumbnailsBody {
  compression: number
  resolution: number
  override: boolean
  simpleFilter: string
  usePresetFilter: boolean
  presetName: string | null
  sessionId?: string
}

export interface GenHighlightsBody {
  resolution: number
  override: boolean
  simpleFilter: string
  usePresetFilter: boolean
  presetName: string | null
  sessionId?: string
  highlightDuration: number
  segmentCount: number
  ffmpegArg: string
}

export async function postGenThumbnails(body: GenThumbnailsBody): Promise<{ id: number }> {
  const res = await fetch("/api/tasks/gen-thumbnails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return (await res.json()) as { id: number }
}

export async function postGenHighlights(body: GenHighlightsBody): Promise<{ id: number }> {
  const res = await fetch("/api/tasks/gen-highlights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return (await res.json()) as { id: number }
}

/** Throws with status 404 in the message when the shuffle has expired. */
export async function fetchMediaInfo(
  shuffleId: number,
  indexes: number[],
): Promise<(MediaInfo | null)[]> {
  const params = new URLSearchParams({ s: String(shuffleId), indexes: indexes.join(",") })
  const res = await fetch(`/api/media-info?${params}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json: unknown = await res.json()
  return [...Effect.runSync(Schema.decodeUnknown(Schema.Array(Schema.NullOr(MediaInfo)))(json))]
}

/**
 * Fetches blocks from the server.
 * When shuffleId is non-null, sends only s= (the cached layout is used; sort/dir ignored).
 * When null, sends q/preset/sort/dir/w/h to generate a new shuffle; the response includes shuffleId.
 * Throws with status 404 in the message when the shuffle has expired.
 */
export async function fetchBlocks(
  shuffleId: number | null,
  indices: number[],
  query = "",
  preset = "default",
  sort = "random",
  dir = "asc",
  sessionId?: string,
): Promise<typeof BlockResponse.Type> {
  const params = new URLSearchParams({ indices: indices.join(",") })
  if (sessionId) params.set("sessionId", sessionId)
  if (shuffleId !== null) {
    params.set("s", String(shuffleId))
  } else {
    if (query.trim()) params.set("q", query.trim())
    if (preset !== "default") params.set("preset", preset)
    if (sort !== "random") params.set("sort", sort)
    if (dir !== "asc") params.set("dir", dir)
    params.set("w", String(window.innerWidth))
    params.set("h", String(window.innerHeight))
  }
  const res = await fetch(`/api/blocks?${params}`)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const json: unknown = await res.json()
  return Effect.runSync(Schema.decodeUnknown(BlockResponse)(json))
}
