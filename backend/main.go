package main

import (
	"embed"
	"errors"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"mediagrid/internal/api"
	"mediagrid/internal/config"
	"mediagrid/internal/store"
	"mediagrid/internal/tasks"
)

//go:embed web/dist
var distFS embed.FS

func main() {
	cfg, err := config.Load(os.Args[1:], os.LookupEnv, os.Stderr)
	if err != nil {
		if errors.Is(err, flag.ErrHelp) {
			os.Exit(0)
		}
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

	dist, err := fs.Sub(distFS, "web/dist")
	if err != nil {
		log.Fatalf("loading embedded frontend: %v", err)
	}
	server := api.NewServer(s, cfg.MediaRoot, cfg.PreviewRoot, taskMgr, http.FileServerFS(dist))

	log.Printf("listening on :%s (media=%s, data=%s)", cfg.Port, cfg.MediaRoot, cfg.DataRoot)
	if err := http.ListenAndServe(":"+cfg.Port, server); err != nil {
		log.Fatal(err)
	}
}
