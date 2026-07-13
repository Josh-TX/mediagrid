package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"mediagrid/internal/preview"
)

type renameRequest struct {
	NewName string `json:"newName"`
}

// handleRenameMedia renames the media file at {path...} to newName (a bare
// filename, staying in the same directory), renaming its thumbnail/
// highlight preview files too if they exist, then repointing its media row.
//
// File operations happen first, DB last, mirroring handleDeleteMedia — if
// the disk rename fails, nothing has changed and the DB is never touched;
// this avoids ever leaving the DB pointing at a path that doesn't exist.
func (s *Server) handleRenameMedia(w http.ResponseWriter, r *http.Request) {
	relPath := r.PathValue("path")
	oldFullPath := filepath.Join(s.mediaRoot, relPath)
	if !pathWithinRoot(s.mediaRoot, oldFullPath) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	var req renameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.NewName == "" || strings.ContainsAny(req.NewName, "/\\") {
		http.Error(w, "newName must be non-empty and contain no path separators", http.StatusBadRequest)
		return
	}

	newRelPath := filepath.Join(filepath.Dir(relPath), req.NewName)
	newFullPath := filepath.Join(s.mediaRoot, newRelPath)
	if !pathWithinRoot(s.mediaRoot, newFullPath) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	if _, err := os.Stat(oldFullPath); err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "source file not found", http.StatusNotFound)
		} else {
			http.Error(w, "failed to stat source file", http.StatusInternalServerError)
		}
		return
	}
	if _, err := os.Stat(newFullPath); err == nil {
		http.Error(w, "a file already exists at the new name", http.StatusConflict)
		return
	} else if !os.IsNotExist(err) {
		http.Error(w, "failed to stat destination file", http.StatusInternalServerError)
		return
	}

	if err := os.Rename(oldFullPath, newFullPath); err != nil {
		http.Error(w, "failed to rename file", http.StatusInternalServerError)
		return
	}

	renamePreviewIfExists(preview.ThumbnailPath(s.previewRoot, relPath), preview.ThumbnailPath(s.previewRoot, newRelPath))
	renamePreviewIfExists(preview.HighlightPath(s.previewRoot, relPath), preview.HighlightPath(s.previewRoot, newRelPath))

	if err := s.store.UpdateMediaPath(relPath, newRelPath); err != nil {
		http.Error(w, "failed to update media row", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// renamePreviewIfExists renames a generated thumbnail/highlight file to
// match a media rename, but only if it exists — no preview having been
// generated yet is normal, not an error.
func renamePreviewIfExists(oldPath, newPath string) {
	if _, err := os.Stat(oldPath); err == nil {
		os.Rename(oldPath, newPath)
	}
}
