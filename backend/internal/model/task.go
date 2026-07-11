package model

// TaskType identifies which background job a Task runs.
type TaskType string

const (
	TaskTypeScan          TaskType = "scan"
	TaskTypeScanClean     TaskType = "scan_clean"
	TaskTypeGenThumbnails TaskType = "gen_thumbnails"
	TaskTypeGenHighlights TaskType = "gen_highlights"
)

// TaskStatus is a Task's current lifecycle state.
type TaskStatus string

const (
	TaskStatusQueued    TaskStatus = "queued"
	TaskStatusActive    TaskStatus = "active"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusCancelled TaskStatus = "cancelled"
)

// TaskInfo is the JSON-serializable snapshot of a task returned by
// GET /api/tasks. StartedAt/FinishedAt are 0 (omitted) until the task
// reaches that stage. Timestamps are Unix milliseconds.
type TaskInfo struct {
	ID         string     `json:"id"`
	Type       TaskType   `json:"type"`
	Name       string     `json:"name"`
	Status     TaskStatus `json:"status"`
	Processed  int        `json:"processed"`
	Total      int        `json:"total"`
	Failed     int        `json:"failed"`
	QueuedAt   int64      `json:"queuedAt"`
	StartedAt  int64      `json:"startedAt,omitempty"`
	FinishedAt int64      `json:"finishedAt,omitempty"`
}
