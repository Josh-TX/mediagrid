import type { Preset } from "@repo/types"
import type { MediaRecord } from "./db"

export function applySimpleFilter(media: MediaRecord[], q: string): MediaRecord[] {
  const terms = q
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase())
  return terms.length === 0 ? media : media.filter((m) => terms.every((t) => m.path.toLowerCase().includes(t)))
}

export function applyPresetFilter(media: MediaRecord[], preset: Preset): MediaRecord[] {
  return media.filter((m) => {
    if (preset.mediaType === "images" && m.media_type !== 2) return false
    if (preset.mediaType === "videos" && m.media_type !== 1) return false

    const ar = m.width / m.height
    if (preset.minAspectRatio !== null && ar < preset.minAspectRatio) return false
    if (preset.maxAspectRatio !== null && ar > preset.maxAspectRatio) return false

    if (preset.minDuration !== null) {
      if (m.duration === null || m.duration < preset.minDuration * 1000) return false
    }
    if (preset.maxDuration !== null) {
      if (m.duration === null || m.duration > preset.maxDuration * 1000) return false
    }

    if (preset.excludeContainsCsv) {
      const terms = preset.excludeContainsCsv
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
      if (terms.some((t) => m.path.toLowerCase().includes(t))) return false
    }

    if (preset.excludeNotContainsCsv) {
      const terms = preset.excludeNotContainsCsv
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
      if (terms.length > 0 && !terms.some((t) => m.path.toLowerCase().includes(t))) return false
    }

    return true
  })
}
