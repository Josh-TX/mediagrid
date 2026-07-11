package api

import "net/http"

// handleScan triggers a Scan (or Scan + Clean, if ?clean=1) task and
// returns immediately; progress is polled via GET /api/tasks.
func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	clean := r.URL.Query().Get("clean") == "1" || r.URL.Query().Get("clean") == "true"
	t := s.tasks.NewScanTask(clean)
	s.tasks.Enqueue(t)
	w.WriteHeader(http.StatusNoContent)
}
