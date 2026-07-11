package api

import (
	"encoding/json"
	"net/http"

	"mediagrid/internal/model"
)

type tasksResponse struct {
	Active *model.TaskInfo  `json:"active"`
	Queue  []model.TaskInfo `json:"queue"`
	Recent []model.TaskInfo `json:"recent"`
}

// handleGetTasks returns the active task, the queue (index 0 = next up),
// and up to the last 10 recent tasks. Polled by the frontend every second
// while the Tasks tab is open.
func (s *Server) handleGetTasks(w http.ResponseWriter, r *http.Request) {
	active, queue, recent := s.tasks.Snapshot()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tasksResponse{Active: active, Queue: queue, Recent: recent})
}

// handleCancelTask cancels a task by id, whether it's active (cooperative —
// finishes the in-flight item, then stops) or still queued (removed
// outright).
func (s *Server) handleCancelTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.tasks.Cancel(id) {
		http.Error(w, "task not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
