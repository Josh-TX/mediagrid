// Package tasks implements the in-memory background task queue backing the
// Settings modal's Tasks tab: at most one task runs at a time, additional
// triggers queue up (duplicates allowed), and nothing here is persisted —
// all state is lost on server restart.
package tasks

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"

	"mediagrid/internal/model"
	"mediagrid/internal/store"
)

// maxRecent caps how many finished tasks Recent Tasks retains; oldest is
// dropped first.
const maxRecent = 10

// Deps are the dependencies task runners need, shared across all tasks
// created by a Manager.
type Deps struct {
	Store       *store.Store
	MediaRoot   string
	PreviewRoot string
}

// Task is one queued/active/finished unit of work. Its mutable fields
// (Status/Processed/Total/Failed/StartedAt/FinishedAt) are only ever
// written by the Manager's single worker goroutine, but are read
// concurrently by HTTP handler goroutines via Manager.Snapshot — all
// reads/writes of those fields go through Manager.mu.
type Task struct {
	ID       string
	Type     model.TaskType
	Name     string
	QueuedAt time.Time

	Status     model.TaskStatus
	Processed  int
	Total      int
	Failed     int
	StartedAt  time.Time
	FinishedAt time.Time

	cancel context.CancelFunc
	run    func(ctx context.Context, t *Task)
}

// Manager runs one task at a time, pulled FIFO from an in-memory queue, on
// a single background worker goroutine.
type Manager struct {
	deps Deps

	mu     sync.Mutex
	active *Task
	queue  []*Task
	recent []*Task

	wake chan struct{}
}

func NewManager(deps Deps) *Manager {
	m := &Manager{deps: deps, wake: make(chan struct{}, 1)}
	go m.loop()
	return m
}

// Enqueue adds t to the back of the queue. Duplicate task types (e.g. two
// Scans) are allowed — the caller decides whether to dedupe.
func (m *Manager) Enqueue(t *Task) {
	t.QueuedAt = time.Now()
	t.Status = model.TaskStatusQueued

	m.mu.Lock()
	m.queue = append(m.queue, t)
	m.mu.Unlock()

	m.signal()
}

func (m *Manager) signal() {
	select {
	case m.wake <- struct{}{}:
	default:
	}
}

func (m *Manager) loop() {
	for {
		m.mu.Lock()
		if m.active == nil && len(m.queue) > 0 {
			t := m.queue[0]
			m.queue = m.queue[1:]
			m.active = t
			m.mu.Unlock()
			m.runTask(t)
			continue
		}
		m.mu.Unlock()
		<-m.wake
	}
}

func (m *Manager) runTask(t *Task) {
	ctx, cancel := context.WithCancel(context.Background())

	m.mu.Lock()
	t.cancel = cancel
	t.Status = model.TaskStatusActive
	t.StartedAt = time.Now()
	m.mu.Unlock()

	t.run(ctx, t)

	m.mu.Lock()
	t.FinishedAt = time.Now()
	if ctx.Err() != nil {
		t.Status = model.TaskStatusCancelled
	} else {
		t.Status = model.TaskStatusCompleted
	}
	m.active = nil
	m.recent = append(m.recent, t)
	if len(m.recent) > maxRecent {
		m.recent = m.recent[len(m.recent)-maxRecent:]
	}
	m.mu.Unlock()

	m.signal()
}

// Cancel cancels the task with the given id, whether it's active or still
// queued. A queued task is simply removed (it never ran, so it won't show
// up in Recent Tasks); the active task is cancelled cooperatively — its run
// function checks ctx between items and stops before starting the next one.
// Returns false if no task with that id is active or queued.
func (m *Manager) Cancel(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.active != nil && m.active.ID == id {
		m.active.cancel()
		return true
	}
	for i, t := range m.queue {
		if t.ID == id {
			m.queue = append(m.queue[:i], m.queue[i+1:]...)
			return true
		}
	}
	return false
}

// SetProgress updates t's processed/total counts. Called by task run
// functions as they work.
func (m *Manager) SetProgress(t *Task, processed, total int) {
	m.mu.Lock()
	t.Processed = processed
	t.Total = total
	m.mu.Unlock()
}

// IncFailed records that one more item failed (and was skipped) within t.
func (m *Manager) IncFailed(t *Task) {
	m.mu.Lock()
	t.Failed++
	m.mu.Unlock()
}

// Snapshot returns JSON-ready copies of the active task, queue, and recent
// tasks for GET /api/tasks. queue[0] is next up.
func (m *Manager) Snapshot() (active *model.TaskInfo, queue []model.TaskInfo, recent []model.TaskInfo) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.active != nil {
		info := toInfo(m.active)
		active = &info
	}
	queue = make([]model.TaskInfo, len(m.queue))
	for i, t := range m.queue {
		queue[i] = toInfo(t)
	}
	recent = make([]model.TaskInfo, len(m.recent))
	for i, t := range m.recent {
		recent[i] = toInfo(t)
	}
	return active, queue, recent
}

func toInfo(t *Task) model.TaskInfo {
	info := model.TaskInfo{
		ID:        t.ID,
		Type:      t.Type,
		Name:      t.Name,
		Status:    t.Status,
		Processed: t.Processed,
		Total:     t.Total,
		Failed:    t.Failed,
		QueuedAt:  t.QueuedAt.UnixMilli(),
	}
	if !t.StartedAt.IsZero() {
		info.StartedAt = t.StartedAt.UnixMilli()
	}
	if !t.FinishedAt.IsZero() {
		info.FinishedAt = t.FinishedAt.UnixMilli()
	}
	return info
}

func newTaskID() string {
	return uuid.NewString()
}
