package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"mediagrid/internal/api"
	"mediagrid/internal/config"
	"mediagrid/internal/store"
	"mediagrid/internal/tasks"
	"mediagrid/internal/webui"
)

var version = "dev" // set via -ldflags "-X main.version=..."

func main() {
	cfg, err := config.Load(os.Args[1:], version)
	if err != nil {
		log.Fatal(err)
	}

	if err := os.MkdirAll(filepath.Join(cfg.PreviewRoot, "thumbnails"), 0o755); err != nil {
		log.Fatalf("creating preview thumbnails dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(cfg.PreviewRoot, "highlights"), 0o755); err != nil {
		log.Fatalf("creating preview highlights dir: %v", err)
	}

	s, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("opening database: %v", err)
	}

	taskMgr := tasks.NewManager(tasks.Deps{Store: s, MediaRoot: cfg.MediaRoot, PreviewRoot: cfg.PreviewRoot})
	taskMgr.Enqueue(taskMgr.NewScanTask(false))

	var static http.Handler = http.NotFoundHandler()
	if webui.Embedded() {
		dist, err := webui.FS()
		if err != nil {
			log.Fatalf("loading embedded frontend: %v", err)
		}
		static = http.FileServerFS(dist)
	} else {
		log.Printf("no frontend embedded, use the Vite dev server (or build with -tags embed_frontend)")
	}
	server := api.NewServer(s, cfg.MediaRoot, cfg.PreviewRoot, taskMgr, static)

	log.Printf("listening on :%s (media=%s, data=%s)", cfg.Port, cfg.MediaRoot, cfg.DataRoot)
	if err := http.ListenAndServe(":"+cfg.Port, server); err != nil {
		log.Fatal(err)
	}
}
