import type { GeneralSettings, Preset } from './types'

export interface SettingField<T> {
  key: keyof T
  label: string
  help: string
  type: 'float' | 'int' | 'bool' | 'select' | 'boolSelect' | 'text'
  options?: { value: string; label: string }[]
  placeholder?: string
  min?: number
  max?: number
  step?: number
}

export interface SettingSection<T> {
  title: string
  fields: SettingField<T>[]
}

// Shown on the General tab, grouped under sub-headers.
export const generalSettingSections: SettingSection<GeneralSettings>[] = [
  {
    title: 'Gallery',
    fields: [
      { key: 'tilePct', label: 'Tile % of Screen', type: 'float', help: 'Maximum tile area relative to screen area.' },
      {
        key: 'defaultSort',
        label: 'Default sort',
        type: 'select',
        help: 'Sort order used on startup.',
        options: [
          { value: 'rand', label: 'Random' },
          { value: 'size', label: 'Size' },
          { value: 'az', label: 'A-Z' },
          { value: 'date', label: 'Date' },
          { value: 'dur', label: 'Dur' },
        ],
      },
      {
        key: 'tilePreviewAlways',
        label: 'Video Tile Playback',
        type: 'boolSelect',
        help: 'On Interaction = plays on hover/tap-hold, Always = autoplays whenever visible.',
        options: [
          { value: 'false', label: 'On Interaction' },
          { value: 'true', label: 'Always' },
        ],
      },
      { key: 'fallbackToOriginal', label: 'Fallback to Original Video', type: 'bool', help: 'When a video preview should play but has no highlight, play the original video instead of just showing a thumbnail/placeholder.' },
    ],
  },
  {
    title: 'Player',
    fields: [
      { key: 'autoplayInitiallyOn', label: 'Autoplay initially on', type: 'bool', help: 'When a video finishes playing in the Player, automatically swap to the next video.' },
      { key: 'playbackSpeed1', label: 'Playback Speed 1', type: 'float', help: 'First alternate playback speed offered in the Player context menu.', min: 0, max: 16, step: 0.1 },
      { key: 'playbackSpeed2', label: 'Playback Speed 2', type: 'float', help: 'Second alternate playback speed offered in the Player context menu.', min: 0, max: 16, step: 0.1 },
      { key: 'rewindSeconds', label: 'Rewind seconds', type: 'int', help: 'Seconds to rewind when the rewind control is tapped.' },
      { key: 'forwardSeconds', label: 'Forward seconds', type: 'int', help: 'Seconds to fast-forward when the forward control is tapped.' },
    ],
  },
  {
    title: 'Letterbox Cropping',
    fields: [
      { key: 'tileCropX', label: 'Tile crop X', type: 'float', help: 'Maximum fraction of a tile that can be cropped horizontally before letterboxing kicks in.' },
      { key: 'tileCropY', label: 'Tile crop Y', type: 'float', help: 'Maximum fraction of a tile that can be cropped vertically before letterboxing kicks in.' },
      { key: 'playerCropX', label: 'Player crop X', type: 'float', help: 'Maximum fraction the Player can crop horizontally before letterboxing.' },
      { key: 'playerCropY', label: 'Player crop Y', type: 'float', help: 'Maximum fraction the Player can crop vertically before letterboxing.' },
    ],
  },
]

// A single row on the Presets tab. Most rows hold one field; a few combine
// multiple fields (each with its own inline label) under one shared row label.
export interface SettingRow<T> {
  label: string
  help: string
  fields: SettingField<T>[]
  separator?: string
}

// Shown on the Presets tab, flat (no section header — the whole tab is preset settings now).
export const presetSettingRows: SettingRow<Preset>[] = [
  {
    label: 'Media Type',
    help: 'Which media types are included in the shuffle list.',
    fields: [
      { key: 'includeVids', label: 'Video', type: 'bool', help: 'Include videos in the shuffle list.' },
      { key: 'includeImages', label: 'Image', type: 'bool', help: 'Include images in the shuffle list.' },
    ],
  },
  {
    label: 'Aspect Ratios',
    help: 'Which aspect ratios are included in the shuffle list.',
    fields: [
      { key: 'includePortrait', label: 'Portrait', type: 'bool', help: 'Include media with an aspect ratio of 1 or less.' },
      { key: 'includeLandscape', label: 'Landscape', type: 'bool', help: 'Include media with an aspect ratio of 1 or greater.' },
    ],
  },
  {
    label: 'Duration (s)',
    help: 'Videos outside this range are excluded. Empty = no limit. No effect on images.',
    separator: '–',
    fields: [
      { key: 'minDuration', label: 'Min', type: 'int', help: 'Videos shorter than this are excluded.', placeholder: 'any' },
      { key: 'maxDuration', label: 'Max', type: 'int', help: 'Videos longer than this are excluded.', placeholder: 'any' },
    ],
  },
  {
    label: 'Whitelist CSV',
    help: 'Comma-separated terms; media must match at least one term to be included.',
    fields: [{ key: 'whitelistCSV', label: 'Whitelist CSV', type: 'text', help: 'Comma-separated terms; media must match at least one term to be included.' }],
  },
  {
    label: 'Blacklist CSV',
    help: 'Comma-separated terms; media matching any term is excluded.',
    fields: [{ key: 'blacklistCSV', label: 'Blacklist CSV', type: 'text', help: 'Comma-separated terms; media matching any term is excluded.' }],
  },
  {
    label: 'Base path',
    help: 'Only include media whose path starts with this (case-insensitive).',
    fields: [{ key: 'basePath', label: 'Base path', type: 'text', help: 'Only include media whose path starts with this (case-insensitive).' }],
  },
]
