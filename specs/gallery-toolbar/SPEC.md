# Gallery Toolbar

## Overview

Add a Toolbar to the Gallery: a sticky, transparent strip with a search input (SimpleFilter) and a settings icon. The settings icon opens a modal with Presets and Tasks tabs (both stubs).

## Toolbar

- Sticky, positioned at the top of the Gallery (not a separate layout element — overlays the grid)
- No solid background; white text throughout
- Minimalistic — low height, minimal obstruction
- The Gallery renders a dark→transparent CSS gradient at its top to back the white text; this gradient is part of the Gallery, not the Toolbar
- After scrolling past the gradient region the Toolbar is nearly invisible (white text over gallery content)

## Search Input (SimpleFilter)

- Labeled "Search" in the UI
- Debounced 400ms — triggers a new server-side fetch after user stops typing
- On change: generate a new random Seed AND pass the current search terms to the backend
- Search terms are passed as a query param to `GET /api/media` (space-delimited or as repeated params — see Backend section)
- Clearing the input re-fetches with no filter and a new Seed

## Backend: `GET /api/media`

- Add optional `q` query param: space-delimited search terms
- Each term must appear somewhere in the Media's file path (AND logic, case-insensitive)
- If `q` is absent or empty, no path filtering is applied (existing behavior preserved)
- Filter is applied before the seeded shuffle and LIMIT slice

## Settings Modal

- Triggered by a settings/gear icon in the Toolbar (right side)
- Built with Radix UI Dialog + Tabs primitives
- Always opens to the Presets tab
- Two tabs: **Presets** and **Tasks**
- Both tab panels show a short placeholder message (e.g. "Coming soon")
- Standard modal behavior: close on overlay click, Escape key, close button

## UI Library

- Add `@radix-ui/react-dialog` and `@radix-ui/react-tabs` to `frontend/package.json`

## Out of Scope

- Actual Presets or Tasks UI (stubs only)
- Pagination or infinite scroll changes
- Any Player changes
