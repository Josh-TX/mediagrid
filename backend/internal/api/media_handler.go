package api

import (
	"net/http"
	"path/filepath"
	"strings"
)

// handleMedia serves the raw file at {path...} (already URL-decoded by
// net/http) joined onto mediaRoot, rejecting any path that resolves outside it.
func (s *Server) handleMedia(w http.ResponseWriter, r *http.Request) {
	relPath := r.PathValue("path")

	fullPath := filepath.Join(s.mediaRoot, relPath)
	cleanRoot := filepath.Clean(s.mediaRoot)
	if fullPath != cleanRoot && !strings.HasPrefix(fullPath, cleanRoot+string(filepath.Separator)) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	http.ServeFile(w, r, fullPath)
}
