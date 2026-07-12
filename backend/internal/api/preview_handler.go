package api

import (
	"net/http"

	"mediagrid/internal/preview"
)

// handleThumbnail serves the generated thumbnail for the media at {path...},
// deriving its on-disk location the same way the gen-thumbnails task does.
func (s *Server) handleThumbnail(w http.ResponseWriter, r *http.Request) {
	relPath := r.PathValue("path")
	fullPath := preview.ThumbnailPath(s.previewRoot, relPath)
	serveGuarded(w, r, s.previewRoot, fullPath)
}

// handleHighlight serves the generated highlight for the media at {path...},
// deriving its on-disk location the same way the gen-highlights task does.
func (s *Server) handleHighlight(w http.ResponseWriter, r *http.Request) {
	relPath := r.PathValue("path")
	fullPath := preview.HighlightPath(s.previewRoot, relPath)
	serveGuarded(w, r, s.previewRoot, fullPath)
}
