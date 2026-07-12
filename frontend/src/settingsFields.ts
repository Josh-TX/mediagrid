import type { GeneralSettings, Preset } from './types'

export interface SettingField<T> {
  key: keyof T
  label: string
  help: string
  type: 'float' | 'int' | 'bool' | 'select' | 'text'
  options?: { value: string; label: string }[]
}

export interface SettingSection<T> {
  title: string
  fields: SettingField<T>[]
}

// Shown on the General tab, grouped under Gallery/Player sub-headers.
export const generalSettingSections: SettingSection<GeneralSettings>[] = [
  {
    title: 'Gallery',
    fields: [
      { key: 'tilePct', label: 'Tile %', type: 'float', help: 'Maximum tile area relative to screen area.' },
      { key: 'tileCropX', label: 'Tile crop X', type: 'float', help: 'Maximum fraction of a tile that can be cropped horizontally before letterboxing kicks in.' },
      { key: 'tileCropY', label: 'Tile crop Y', type: 'float', help: 'Maximum fraction of a tile that can be cropped vertically before letterboxing kicks in.' },
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
        key: 'autoPlayTile',
        label: 'Video tile playback',
        type: 'select',
        help: 'off = static poster frame, hover = plays on hover/tap-hold, always = autoplays whenever visible.',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'hover', label: 'Hover' },
          { value: 'always', label: 'Always' },
        ],
      },
      { key: 'fallbackToOriginal', label: 'Fallback to original', type: 'bool', help: 'When a video preview should play but has no highlight, play the original video instead of just showing a thumbnail/placeholder.' },
    ],
  },
  {
    title: 'Player',
    fields: [
      {
        key: 'onVidEnd',
        label: 'When video ends',
        type: 'select',
        help: 'What happens when a video finishes playing in the Player.',
        options: [
          { value: 'loop', label: 'Loop' },
          { value: 'stop', label: 'Stop' },
          { value: 'next', label: 'Next' },
        ],
      },
      { key: 'playerCropX', label: 'Player crop X', type: 'float', help: 'Maximum fraction the Player can crop horizontally before letterboxing.' },
      { key: 'playerCropY', label: 'Player crop Y', type: 'float', help: 'Maximum fraction the Player can crop vertically before letterboxing.' },
      { key: 'rewindSeconds', label: 'Rewind seconds', type: 'int', help: 'Seconds to rewind when the rewind control is tapped.' },
      { key: 'forwardSeconds', label: 'Forward seconds', type: 'int', help: 'Seconds to fast-forward when the forward control is tapped.' },
    ],
  },
]

// Shown on the Presets tab, flat (no section header — the whole tab is preset settings now).
export const presetSettingFields: SettingField<Preset>[] = [
  { key: 'includeVids', label: 'Include videos', type: 'bool', help: 'Include videos in the shuffle list.' },
  { key: 'includeImages', label: 'Include images', type: 'bool', help: 'Include images in the shuffle list.' },
  { key: 'includePortrait', label: 'Include portrait', type: 'bool', help: 'Include media with an aspect ratio of 1 or less.' },
  { key: 'includeLandscape', label: 'Include landscape', type: 'bool', help: 'Include media with an aspect ratio of 1 or greater.' },
  { key: 'minDuration', label: 'Min duration (s)', type: 'int', help: 'Videos shorter than this are excluded. 0 = no minimum. No effect on images.' },
  { key: 'maxDuration', label: 'Max duration (s)', type: 'int', help: 'Videos longer than this are excluded. 0 = no maximum. No effect on images.' },
  { key: 'whitelistCSV', label: 'Whitelist', type: 'text', help: 'Comma-separated terms; media must match at least one term to be included.' },
  { key: 'blacklistCSV', label: 'Blacklist', type: 'text', help: 'Comma-separated terms; media matching any term is excluded.' },
  { key: 'basePath', label: 'Base path', type: 'text', help: 'Only include media whose path starts with this (case-insensitive).' },
]
