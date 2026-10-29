package tasks

import (
	"context"
	"log"
	"path/filepath"

	"mediagrid/internal/model"
	"mediagrid/internal/preview"
	"mediagrid/internal/shuffle"
)

// spriteJob pairs a video with the row count it gets (computed once up
// front from its duration).
type spriteJob struct {
	media model.Media
	rows  int
}

// NewGenSpritesTask builds a Gen Sprites task using settings. Sprites are
// only generated for videos. Without Override, videos that already have a
// sprite (of any grid) are skipped.
func (m *Manager) NewGenSpritesTask(settings model.SpriteSettings) *Task {
	t := &Task{ID: newTaskID(), Type: model.TaskTypeGenSprites, Name: "Gen Sprites"}
	t.run = func(ctx context.Context, t *Task) {
		m.runGenSprites(ctx, t, settings)
	}
	return t
}

func (m *Manager) runGenSprites(ctx context.Context, t *Task, settings model.SpriteSettings) {
	allMedia, err := m.deps.Store.ListAllMedia()
	if err != nil {
		log.Printf("gen-sprites: listing media: %v", err)
		return
	}

	params, err := buildFilterParams(m.deps, settings.Filter, settings.UsePresetFilter, settings.PresetName)
	if err != nil {
		log.Printf("gen-sprites: building filter: %v", err)
		return
	}
	filtered := shuffle.Filter(allMedia, params)

	index := preview.NewSpriteIndex(m.deps.PreviewRoot)
	targets := make([]spriteJob, 0, len(filtered))
	for _, med := range filtered {
		if !med.IsVid {
			continue
		}
		rows, ok := preview.CalcSpriteRows(float64(med.Duration), settings.MaxRows, settings.MinDurationTwoRows, settings.MinDurationMaxRows)
		if !ok {
			continue
		}
		if !settings.Override {
			if _, _, _, exists := index.Find(med.Path); exists {
				continue
			}
		}
		targets = append(targets, spriteJob{media: med, rows: rows})
	}

	m.SetProgress(t, 0, len(targets))
	for i, job := range targets {
		if ctx.Err() != nil {
			return
		}

		srcPath := filepath.Join(m.deps.MediaRoot, job.media.Path)
		outPath := preview.SpritePath(m.deps.PreviewRoot, job.media.Path, job.rows, settings.Columns)
		w, h := preview.TargetDimensions(job.media.Width, job.media.Height, settings.TargetPixels)

		if err := preview.GenerateSprite(srcPath, outPath, float64(job.media.Duration), job.rows, settings.Columns, w, h, settings.Quality); err != nil {
			log.Printf("gen-sprites: %s: %v", job.media.Path, err)
			m.IncFailed(t)
		} else {
			// A previous sprite with a different grid would otherwise linger.
			preview.RemoveSprites(m.deps.PreviewRoot, job.media.Path, outPath)
		}

		m.SetProgress(t, i+1, len(targets))
	}
}
