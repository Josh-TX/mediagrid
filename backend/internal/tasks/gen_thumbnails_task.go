package tasks

import (
	"context"
	"log"
	"os"
	"path/filepath"

	"mediagrid/internal/model"
	"mediagrid/internal/preview"
	"mediagrid/internal/shuffle"
)

// NewGenThumbnailsTask builds a Gen Thumbnails task using settings. Media
// needing a thumbnail is determined once up front (matching media whose
// output path doesn't already exist, or all matching media if Override is
// set); that count becomes Total.
func (m *Manager) NewGenThumbnailsTask(settings model.ThumbnailSettings) *Task {
	t := &Task{ID: newTaskID(), Type: model.TaskTypeGenThumbnails, Name: "Gen Thumbnails"}
	t.run = func(ctx context.Context, t *Task) {
		m.runGenThumbnails(ctx, t, settings)
	}
	return t
}

func (m *Manager) runGenThumbnails(ctx context.Context, t *Task, settings model.ThumbnailSettings) {
	allMedia, err := m.deps.Store.ListAllMedia()
	if err != nil {
		log.Printf("gen-thumbnails: listing media: %v", err)
		return
	}

	params, err := buildFilterParams(m.deps, settings.Filter, settings.UsePresetFilter, settings.PresetName)
	if err != nil {
		log.Printf("gen-thumbnails: building filter: %v", err)
		return
	}
	filtered := shuffle.Filter(allMedia, params)

	targets := make([]model.Media, 0, len(filtered))
	for _, med := range filtered {
		outPath := preview.ThumbnailPath(m.deps.PreviewRoot, med.Path)
		if !settings.Override {
			if _, err := os.Stat(outPath); err == nil {
				continue
			}
		}
		targets = append(targets, med)
	}

	m.SetProgress(t, 0, len(targets))
	for i, med := range targets {
		if ctx.Err() != nil {
			return
		}

		srcPath := filepath.Join(m.deps.MediaRoot, med.Path)
		outPath := preview.ThumbnailPath(m.deps.PreviewRoot, med.Path)
		w, h := preview.TargetDimensions(med.Width, med.Height, settings.TargetPixels)

		if err := preview.GenerateThumbnail(srcPath, outPath, med.IsVid, med.Duration, w, h, settings.Quality); err != nil {
			log.Printf("gen-thumbnails: %s: %v", med.Path, err)
			m.IncFailed(t)
		}

		m.SetProgress(t, i+1, len(targets))
	}
}
