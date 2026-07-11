package tasks

import (
	"context"
	"log"

	"mediagrid/internal/model"
	"mediagrid/internal/scan"
)

// NewScanTask builds a Scan (or Scan + Clean) task. Clean runs first as a
// quick pre-step whose own item count isn't reflected in progress numbers;
// the scan itself then reports progress via its usual two-pass counting.
func (m *Manager) NewScanTask(clean bool) *Task {
	typ := model.TaskTypeScan
	name := "Scan"
	if clean {
		typ = model.TaskTypeScanClean
		name = "Scan + Clean"
	}

	t := &Task{ID: newTaskID(), Type: typ, Name: name}
	t.run = func(ctx context.Context, t *Task) {
		if clean {
			if err := scan.Clean(m.deps.Store, m.deps.MediaRoot, m.deps.PreviewRoot); err != nil {
				log.Printf("scan task: clean failed: %v", err)
			}
		}
		if err := scan.Run(ctx, m.deps.Store, m.deps.MediaRoot, func(processed, total int) {
			m.SetProgress(t, processed, total)
		}); err != nil {
			log.Printf("scan task: scan failed: %v", err)
		}
	}
	return t
}
