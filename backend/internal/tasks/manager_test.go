package tasks

import (
	"context"
	"sync"
	"testing"
	"time"

	"mediagrid/internal/model"
)

func newTestTask(id string, run func(ctx context.Context, t *Task)) *Task {
	return &Task{ID: id, Type: model.TaskTypeScan, Name: id, run: run}
}

func awaitSnapshot(t *testing.T, m *Manager, timeout time.Duration, ready func(active *model.TaskInfo, queue, recent []model.TaskInfo) bool) {
	t.Helper()
	deadline := time.After(timeout)
	for {
		active, queue, recent := m.Snapshot()
		if ready(active, queue, recent) {
			return
		}
		select {
		case <-deadline:
			t.Fatalf("condition not met within %v", timeout)
		case <-time.After(5 * time.Millisecond):
		}
	}
}

// Only one task runs at a time, and queued tasks (including duplicate types)
// run strictly in FIFO order.
func TestManager_RunsTasksInFIFOOrder(t *testing.T) {
	m := NewManager(Deps{})

	var mu sync.Mutex
	var order []string
	done := make(chan struct{}, 3)

	for _, id := range []string{"a", "b", "c"} {
		id := id
		m.Enqueue(newTestTask(id, func(ctx context.Context, tk *Task) {
			mu.Lock()
			order = append(order, id)
			mu.Unlock()
			done <- struct{}{}
		}))
	}

	for i := 0; i < 3; i++ {
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Fatal("timed out waiting for tasks to run")
		}
	}

	mu.Lock()
	defer mu.Unlock()
	if len(order) != 3 || order[0] != "a" || order[1] != "b" || order[2] != "c" {
		t.Fatalf("got order %v, want [a b c]", order)
	}
}

// Cancelling a task still sitting in the queue removes it outright — it
// never runs, and doesn't show up in Recent Tasks.
func TestManager_CancelQueuedTaskRemovesItWithoutRunning(t *testing.T) {
	m := NewManager(Deps{})

	block := make(chan struct{})
	first := newTestTask("first", func(ctx context.Context, tk *Task) { <-block })
	ran := make(chan struct{}, 1)
	second := newTestTask("second", func(ctx context.Context, tk *Task) { ran <- struct{}{} })

	m.Enqueue(first)
	m.Enqueue(second)

	awaitSnapshot(t, m, 2*time.Second, func(active *model.TaskInfo, queue, recent []model.TaskInfo) bool {
		return active != nil && len(queue) == 1
	})

	if !m.Cancel(second.ID) {
		t.Fatal("expected Cancel to find the queued task")
	}
	close(block)

	select {
	case <-ran:
		t.Fatal("a task cancelled while queued should never run")
	case <-time.After(200 * time.Millisecond):
	}

	awaitSnapshot(t, m, 2*time.Second, func(active *model.TaskInfo, queue, recent []model.TaskInfo) bool {
		return active == nil && len(queue) == 0
	})
	_, _, recent := m.Snapshot()
	for _, r := range recent {
		if r.ID == second.ID {
			t.Fatal("a task cancelled while queued should not appear in Recent Tasks")
		}
	}
}

// Cancelling the active task is cooperative: its run function observes
// ctx.Done() and the task ends up marked "cancelled" in Recent Tasks.
func TestManager_CancelActiveTaskMarksCancelled(t *testing.T) {
	m := NewManager(Deps{})

	started := make(chan struct{})
	task := newTestTask("t", func(ctx context.Context, tk *Task) {
		close(started)
		<-ctx.Done()
	})
	m.Enqueue(task)

	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("task never started")
	}

	if !m.Cancel(task.ID) {
		t.Fatal("expected Cancel to find the active task")
	}

	awaitSnapshot(t, m, 2*time.Second, func(active *model.TaskInfo, queue, recent []model.TaskInfo) bool {
		for _, r := range recent {
			if r.ID == task.ID {
				return true
			}
		}
		return false
	})

	_, _, recent := m.Snapshot()
	for _, r := range recent {
		if r.ID == task.ID {
			if r.Status != model.TaskStatusCancelled {
				t.Fatalf("got status %v, want cancelled", r.Status)
			}
			return
		}
	}
}
