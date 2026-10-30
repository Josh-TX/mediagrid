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
        key: 'videoTileInitial',
        label: 'Video Tile Initial',
        type: 'select',
        help: 'Best preview a video tile shows at rest. Tiles missing that preview fall back to the next lower one (Highlight > Sprite > Thumbnail).',
        options: [
          { value: 'thumbnail', label: 'Thumbnail' },
          { value: 'sprite', label: 'Sprite' },
          { value: 'highlight', label: 'Highlight' },
        ],
      },
      {
        key: 'videoTileInteract',
        label: 'Video Tile Interact',
        type: 'select',
        help: 'Best preview a video tile shows on hover/tap-hold. Tiles missing that preview fall back to the next lower one.',
        options: [
          { value: 'sprite', label: 'Sprite' },
          { value: 'highlight', label: 'Highlight' },
        ],
      },
      { key: 'spriteFps', label: 'Sprite FPS', type: 'float', help: 'Frames per second when a sprite plays in a tile.', min: 0.1, max: 60, step: 0.5 },
      {
        key: 'galleryTitleMode',
        label: 'Tile title',
        type: 'select',
        help: 'What to show as a tile\'s title in the Gallery.',
        options: [
          { value: 'full', label: 'Full Path' },
          { value: 'filename', label: 'Filename Only' },
          { value: 'parentTop', label: 'Parent directory on top' },
        ],
      },
      { key: 'galleryTitleExt', label: 'File ext in title', type: 'bool', help: 'Include the file extension in the tile title.' },
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
      {
        key: 'playerTitleMode',
        label: 'Title',
        type: 'select',
        help: 'What to show as the title in the Player.',
        options: [
          { value: 'full', label: 'Full Path' },
          { value: 'filename', label: 'Filename Only' },
          { value: 'parentTop', label: 'Parent directory on top' },
        ],
      },
      { key: 'playerTitleExt', label: 'File ext in title', type: 'bool', help: 'Include the file extension in the Player title.' },
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
    label: 'Base path',
    help: 'Only include media whose path starts with this (case-insensitive).',
    fields: [{ key: 'basePath', label: 'Base path', type: 'text', help: 'Only include media whose path starts with this (case-insensitive).' }],
  },
  {
    label: 'Whitelist CSV: contains',
    help: 'Comma-separated terms; media must match at least one term to be included.',
    fields: [{ key: 'whitelistCSV', label: 'Whitelist CSV: contains', type: 'text', help: 'Comma-separated terms; media must match at least one term to be included.' }],
  },
  {
    label: 'Blacklist CSV: contains',
    help: 'Comma-separated terms; media matching any term is excluded.',
    fields: [{ key: 'blacklistCSV', label: 'Blacklist CSV: contains', type: 'text', help: 'Comma-separated terms; media matching any term is excluded.' }],
  },
]
