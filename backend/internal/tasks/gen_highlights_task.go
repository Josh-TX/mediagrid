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

// highlightJob pairs a video with the segment count it supports (computed
// once up front via the max-proportion rule), so the run loop doesn't
// recompute it.
type highlightJob struct {
	media    model.Media
	segments int
}

// NewGenHighlightsTask builds a Gen Highlights task using settings.
// Highlights are only generated for videos; videos too short even for one
// segment (per the max-proportion rule) are skipped entirely and don't
// count toward Total.
func (m *Manager) NewGenHighlightsTask(settings model.HighlightSettings) *Task {
	t := &Task{ID: newTaskID(), Type: model.TaskTypeGenHighlights, Name: "Gen Highlights"}
	t.run = func(ctx context.Context, t *Task) {
		m.runGenHighlights(ctx, t, settings)
	}
	return t
}

func (m *Manager) runGenHighlights(ctx context.Context, t *Task, settings model.HighlightSettings) {
	allMedia, err := m.deps.Store.ListAllMedia()
	if err != nil {
		log.Printf("gen-highlights: listing media: %v", err)
		return
	}

	params, err := buildFilterParams(m.deps, settings.Filter, settings.UsePresetFilter, settings.PresetName)
	if err != nil {
		log.Printf("gen-highlights: building filter: %v", err)
		return
	}
	filtered := shuffle.Filter(allMedia, params)

	targets := make([]highlightJob, 0, len(filtered))
	for _, med := range filtered {
		if !med.IsVid {
			continue
		}
		n, ok := preview.CalcHighlightSegments(float64(med.Duration), settings.SegmentCount, settings.SegmentDuration, settings.MaxProportion)
		if !ok {
			continue
		}
		outPath := preview.HighlightPath(m.deps.PreviewRoot, med.Path)
		if !settings.Override {
			if _, err := os.Stat(outPath); err == nil {
				continue
			}
		}
		targets = append(targets, highlightJob{media: med, segments: n})
	}

	m.SetProgress(t, 0, len(targets))
	for i, job := range targets {
		if ctx.Err() != nil {
			return
		}

		srcPath := filepath.Join(m.deps.MediaRoot, job.media.Path)
		outPath := preview.HighlightPath(m.deps.PreviewRoot, job.media.Path)
		w, h := preview.TargetDimensions(job.media.Width, job.media.Height, settings.TargetPixels)

		highlightDuration := float64(job.segments) * settings.SegmentDuration
		start := (float64(job.media.Duration) - highlightDuration) / 2
		if start < 0 {
			start = 0
		}

		if err := preview.GenerateHighlight(srcPath, outPath, start, highlightDuration, w, h, settings.FfmpegArgs); err != nil {
			log.Printf("gen-highlights: %s: %v", job.media.Path, err)
			m.IncFailed(t)
		}

		m.SetProgress(t, i+1, len(targets))
	}
}
