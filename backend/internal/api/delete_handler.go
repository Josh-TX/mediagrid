package api

import (
	"net/http"
	"os"
	"path/filepath"

	"mediagrid/internal/preview"
)

// handleDeleteMedia deletes the on-disk media file at {path...} plus its
// generated thumbnail/highlight preview files, then removes its row from the
// media table.
//
// File/preview removal happens first, best-effort (ignoring "not exist"
// errors, mirroring scan.Clean's pattern) — if the DB delete then somehow
// fails, the existing scan.Clean self-healing logic will remove the
// orphaned row on the next scan. Doing it in the opposite order risks the
// file being "resurrected" as a new row on the next scan if file removal
// fails after the DB row is already gone.
//
// A path with no matching media row is treated as already-deleted
// (idempotent), not an error — there's no UI trigger for this endpoint yet,
// so correctness doesn't hinge on that edge case.
func (s *Server) handleDeleteMedia(w http.ResponseWriter, r *http.Request) {
	relPath := r.PathValue("path")
	fullPath := filepath.Join(s.mediaRoot, relPath)
	if !pathWithinRoot(s.mediaRoot, fullPath) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	if err := os.Remove(fullPath); err != nil && !os.IsNotExist(err) {
		http.Error(w, "failed to delete file", http.StatusInternalServerError)
		return
	}
	os.Remove(preview.ThumbnailPath(s.previewRoot, relPath))
	os.Remove(preview.HighlightPath(s.previewRoot, relPath))

	if err := s.store.DeleteMedia(relPath); err != nil {
		http.Error(w, "failed to delete media row", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
