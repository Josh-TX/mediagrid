# MediaGrid

A mobile-first website that shows a gallery of images/videos and has a reel-like player

## Usage

```sh
mediagrid --media /path/to/media --data /path/to/data --port 3000
```

| Flag | Env var | Default | Description |
|---|---|---|---|
| `-m`, `--media` | `MEDIAGRID_MEDIA` | required | media root directory to scan |
| `-d`, `--data` | `MEDIAGRID_DATA` | required | data directory (database, thumbnails, highlights) |
| `-p`, `--port` | `MEDIAGRID_PORT` | `8080` | port to listen on |

## Building

```sh
make build      # builds the frontend, then ./mediagrid with the frontend embedded
```

The frontend is only embedded when built with `-tags embed_frontend` (`make backend` does this). A plain `go build` in `backend/` works without Node, but serves no UI. For development, run `go run .` in `backend/` and `npm run dev` in `frontend/`.
