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
	serveGuarded(w, r, s.mediaRoot, filepath.Join(s.mediaRoot, relPath))
}

// serveGuarded serves fullPath, rejecting any path that resolves outside root.
func serveGuarded(w http.ResponseWriter, r *http.Request, root, fullPath string) {
	if !pathWithinRoot(root, fullPath) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	http.ServeFile(w, r, fullPath)
}

// pathWithinRoot reports whether fullPath is root itself or resolves inside
// it, guarding against a {path...} param (e.g. containing "../") escaping
// the intended root directory.
func pathWithinRoot(root, fullPath string) bool {
	cleanRoot := filepath.Clean(root)
	return fullPath == cleanRoot || strings.HasPrefix(fullPath, cleanRoot+string(filepath.Separator))
}
