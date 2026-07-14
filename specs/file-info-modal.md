# File Info Modal

## Description

I want to replace the Gallery tile context menu's **Rename** and **Delete** options with a single **Info** option that opens a new File Info modal. The context menu becomes: **Open**, **Open Raw**, **Info**.

The File Info modal shows all the info currently shown by the Player's info tooltip (filename, date, filesize, resolution, duration-if-video), plus a new row for the file's full relative path (directory + filename) — the current tooltip only shows the bare filename, never the directory.

The modal also has **Rename** and **Delete** buttons. These behave exactly the same as the current context-menu-driven rename/delete: native `prompt()` for rename (pre-filled with the base filename, extension preserved and shown in the message, re-prompts on validation/backend error with the error reflected in the message), and native `confirm()`/`alert()` for delete (confirm before deleting, alert on failure). No loading spinner during the request — these are fast local-network operations. On a failed request, the modal stays open/untouched (same as today: no forced reload since nothing on disk changed).

On a **successful** rename or delete, the modal auto-closes and a toast fires using the existing `toastStore.show(...)` (the same store already used for things like `"invalid media index"` in `urlStore.ts`) with the message `"file renamed"` or `"file deleted"` (lowercase, matching existing toast style).

The modal is a single shared component used both by the Gallery (opened via the tile context menu's new Info item) and by the Player (opened via the info icon, replacing the current tooltip). This works because the Player's `mediaList` is derived directly from `galleryStore.state.rows`, so the same reactive tile object/`tilei` is available in both places — rename can call the existing `galleryStore.renameTile(tilei, newPath)` regardless of which context opened the modal.

Deleting from the Gallery still needs to trigger the tile's existing cache-bust/forced-reload behavior (`Tile.vue`'s `cacheBust`) so the "failed to load" placeholder kicks in immediately. Deleting the currently-open media from within the Player needs no special handling — the already-loaded/playing media just keeps playing; if the user later swaps away and back (or reloads), the existing "failed to load video/image" placeholder in `PlayerMedia.vue` naturally covers it.

### Modal style

Follow the existing `SettingsModal.vue` structural/visual pattern rather than the current bottom-sheet-style info tooltip: a full-screen overlay (`position: fixed; inset: 0`) with a centered dark rounded card, and a `×` close button in the top-right of the card's header. Clicking the overlay (outside the card) dismisses the modal, same as `SettingsModal`. Additionally, add Escape-to-close (which `SettingsModal` doesn't currently have, but `TileContextMenu` does) for consistency with the context menu this is replacing.

### Player cleanup

Delete the Player's current info tooltip implementation entirely from `PlayerHud.vue` (the `infoOpen` ref, `.info-backdrop`/`.info-tooltip` markup and styles, and the associated computeds that are no longer needed there if they move into the shared modal). The info icon (`.info-icon-hit`/`.info-icon`, the small circled "i") stays in the same place in the title-time row, but its click handler now opens the new File Info modal instead of toggling the old tooltip.

## Out of Scope

- Any context menu inside the Player (still Gallery-only, per the existing `gallery-tile-context-menu` spec).
- Bulk/multi-select rename or delete.
- Moving a file to a different directory via rename (filename only, directory fixed) — unchanged from existing behavior.
- Queueing multiple toasts — the existing single-slot toast store behavior (a new toast replaces whatever's showing) is unchanged.
