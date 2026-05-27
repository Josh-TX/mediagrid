# Media Gallery App

## Description

I want a privately hosted web app that displays a gallery of images from a `/media` directory that is volume-mounted at runtime via Docker. There is no authentication — access control is handled at the network level.

The project lives in a Bun workspaces monorepo at `/home/josh/projects/MediaGrid` with three packages: `backend/`, `frontend/`, and `packages/types/`. The shared types package exports `ImageEntry` as an Effect Schema, which both the backend and frontend import from `@repo/types`.

`ImageEntry` has five fields: `path` (relative URL string, e.g. `subdir/photo.jpg`), `name` (filename), `mtime` (epoch ms integer), `width` (px integer), and `height` (px integer). Width and height are read from image file headers at scan time using the `image-size` package.

The backend is built with `@effect/platform` and `@effect/platform-bun`. It exposes two routes:

- `GET /api/images?r=<integer>` — recursively scans `/media` for `.jpg .jpeg .png .gif .webp` files (flattening all subdirectories), shuffles the full list using a seeded Fisher-Yates shuffle (mulberry32 PRNG, inlined, no extra dependency), and returns the first 20 results as `ImageEntry[]`. The scan happens on every request. If `r` is absent or not a valid integer, the endpoint returns 400. The limit is hardcoded at 20. The `MEDIA_DIR` env var configures the media path (default `/media`); `PORT` configures the port (default `3000`).
- `GET /media/*` — streams the original image file at that path with no resizing.

In production, the backend also serves the built frontend from a static directory.

The frontend is built with React, Vite, and TypeScript with the strictest compiler settings (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`). Styling is CSS Modules — no Tailwind. Data fetching uses TanStack Query. The API layer imports `ImageEntry` schema from `@repo/types` and decodes the `/api/images` response through it for runtime safety.

On mount, the frontend generates a random integer seed and passes it as `?r=<seed>` to the query. Every page refresh produces a new seed and thus a new shuffle. No explicit reshuffle button for now.

The gallery fills the full viewport with no header. Background is white/light. Images are arranged in a 2-column CSS Grid (always 2 columns, including desktop). Portrait images occupy 1 column; landscape images (`width > height`) span both columns via `grid-column: span 2`. Row height is determined naturally by the image's aspect ratio (`grid-auto-rows: auto`, `width: 100%` on `<img>`). Gap between images and between images and screen edges is 2px. Images use native `loading="lazy"`. Clicking an image is a no-op for now. While the API is loading, the gallery shows 20 grey skeleton cards in the same grid shape.

The linter and formatter is Biome. Dev workflow: two terminal commands from the workspace root — `bun run dev:backend` (bun `--watch`) and `bun run dev:frontend` (Vite). Vite proxies `/api` and `/media` to `http://localhost:3000` in dev mode.

Testing uses vertical integration slices. Backend tests use `@effect/platform`'s in-memory `HttpClient` (no real TCP) — routes are tested through the full Effect layer stack without spinning up a Bun socket. Frontend tests use Vitest + MSW + Testing Library, rendering full component trees against a mocked API. Coverage includes loading state, error state, and empty state.

There are two Dockerfiles: `Dockerfile` (multi-stage: builds frontend inside Docker, then assembles runtime image) and `Dockerfile-fast` (expects a pre-built `frontend/dist/`, just packages it into the runtime image). `docker-compose.yml` exposes port `8080:3000` and volume-mounts `/media` read-only.

## Out of Scope

- Authentication or any access control in the application layer
- Thumbnail generation or image resizing
- Pagination, infinite scroll, or any way to load more than 20 images per seed
- Fullscreen / slide-in image viewer (planned for a future spec)
- Reshuffle button or any UI seed controls (planned for a future spec)
- Video support
- Masonry layout via external library — layout is CSS Grid with column-span logic based on orientation
