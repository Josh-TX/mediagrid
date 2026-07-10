package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"

	"mediagrid/internal/api"
	"mediagrid/internal/config"
	"mediagrid/internal/scan"
	"mediagrid/internal/store"
)

//go:embed web/dist
var distFS embed.FS

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	s, err := store.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("opening database: %v", err)
	}

	go scan.Run(s, cfg.MediaRoot)

	dist, err := fs.Sub(distFS, "web/dist")
	if err != nil {
		log.Fatalf("loading embedded frontend: %v", err)
	}
	server := api.NewServer(s, cfg.MediaRoot, http.FileServerFS(dist))

	log.Printf("listening on :%s (MEDIA_ROOT=%s)", cfg.Port, cfg.MediaRoot)
	if err := http.ListenAndServe(":"+cfg.Port, server); err != nil {
		log.Fatal(err)
	}
}
