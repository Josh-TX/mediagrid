package config

import (
	"fmt"
	"os"
)

type Config struct {
	MediaRoot   string
	PreviewRoot string
	Port        string
	DBPath      string
}

func Load() (Config, error) {
	mediaRoot := os.Getenv("MEDIA_ROOT")
	if mediaRoot == "" {
		return Config{}, fmt.Errorf("MEDIA_ROOT env var is required")
	}
	previewRoot := os.Getenv("PREVIEW_ROOT")
	if previewRoot == "" {
		return Config{}, fmt.Errorf("PREVIEW_ROOT env var is required")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "mediagrid.db"
	}
	return Config{
		MediaRoot:   mediaRoot,
		PreviewRoot: previewRoot,
		Port:        port,
		DBPath:      dbPath,
	}, nil
}
