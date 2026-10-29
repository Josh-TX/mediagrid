package api

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"mediagrid/internal/library"
	"mediagrid/internal/preview"
)

type moveRequest struct {
	DestDir string `json:"destDir"`
	// NewName optionally renames the file as part of the move (a bare
	// filename); empty keeps the current name.
	NewName string `json:"newName"`
	// Copy leaves the source in place and creates a copy at the destination.
	Copy      bool `json:"copy"`
	Overwrite bool `json:"overwrite"`
}

type moveResponse struct {
	// Path is the file's new media-root-relative path.
	Path string `json:"path"`
	// InLibrary is false when the destination falls outside the library
	// filter: the media row and previews were removed instead of repointed.
	InLibrary bool `json:"inLibrary"`
}

// handleMoveMedia moves (or, with copy, copies) the media file at {path...} into destDir (created if
// missing), optionally renaming it (newName). If a file with that name already exists
// there, it's a 409 unless overwrite is set, in which case the existing file,
// its previews and its media row are removed first.
//
// If the destination passes the library filter the row and previews follow
// the file; otherwise the row and previews are deleted (what Clean would do
// on the next scan). File operations happen before DB changes, as in
// rename/delete.
func (s *Server) handleMoveMedia(w http.ResponseWriter, r *http.Request) {
	relPath := r.PathValue("path")
	oldFull := filepath.Join(s.mediaRoot, relPath)
	if !pathWithinRoot(s.mediaRoot, oldFull) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	var req moveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	destDir, ok := canonicalDir(req.DestDir)
	if !ok {
		http.Error(w, "invalid destination", http.StatusBadRequest)
		return
	}

	name := req.NewName
	if name == "" {
		name = filepath.Base(relPath)
	}
	if strings.ContainsAny(name, "/\\") {
		http.Error(w, "newName must contain no path separators", http.StatusBadRequest)
		return
	}
	newRel := strings.TrimPrefix(path.Join(destDir, name), "/")
	newFull := filepath.Join(s.mediaRoot, filepath.FromSlash(newRel))
	if !pathWithinRoot(s.mediaRoot, newFull) {
		http.Error(w, "invalid destination", http.StatusBadRequest)
		return
	}
	if filepath.Clean(oldFull) == filepath.Clean(newFull) {
		http.Error(w, "file is already at that location", http.StatusBadRequest)
		return
	}

	if fi, err := os.Stat(oldFull); err != nil || fi.IsDir() {
		http.Error(w, "source file not found", http.StatusNotFound)
		return
	}
	destExists := false
	if fi, err := os.Stat(newFull); err == nil {
		if fi.IsDir() {
			http.Error(w, "a folder with that name exists at the destination", http.StatusConflict)
			return
		}
		if !req.Overwrite {
			http.Error(w, "a file already exists at the destination", http.StatusConflict)
			return
		}
		destExists = true
	} else if !os.IsNotExist(err) {
		http.Error(w, "failed to stat destination file", http.StatusInternalServerError)
		return
	}

	if err := os.MkdirAll(filepath.Dir(newFull), 0o755); err != nil {
		http.Error(w, "failed to create destination folder", http.StatusInternalServerError)
		return
	}
	if req.Copy {
		if err := copyFile(oldFull, newFull); err != nil {
			http.Error(w, "failed to copy file", http.StatusInternalServerError)
			return
		}
	} else if err := os.Rename(oldFull, newFull); err != nil {
		http.Error(w, "failed to move file", http.StatusInternalServerError)
		return
	}

	if destExists {
		os.Remove(preview.ThumbnailPath(s.previewRoot, newRel))
		os.Remove(preview.HighlightPath(s.previewRoot, newRel))
		preview.RemoveSprites(s.previewRoot, newRel, "")
		if err := s.store.DeleteMedia(newRel); err != nil {
			http.Error(w, "failed to delete overwritten media row", http.StatusInternalServerError)
			return
		}
	}

	ls, err := s.store.GetLibrarySettings()
	if err != nil {
		http.Error(w, "failed to load library settings", http.StatusInternalServerError)
		return
	}
	inLib := library.New(ls).InLibrary(newRel)

	switch {
	case req.Copy:
		// Source row/previews stay. A copy inside the library gets its own
		// row (same probed metadata) and copies of the previews.
		if inLib {
			m, found, err := s.store.GetMediaByPath(relPath)
			if err != nil {
				http.Error(w, "failed to load media row", http.StatusInternalServerError)
				return
			}
			if found {
				m.Path = newRel
				if err := s.store.InsertMedia(m); err != nil {
					http.Error(w, "failed to insert media row", http.StatusInternalServerError)
					return
				}
			}
			copyPreviewIfExists(preview.ThumbnailPath(s.previewRoot, relPath), preview.ThumbnailPath(s.previewRoot, newRel))
			copyPreviewIfExists(preview.HighlightPath(s.previewRoot, relPath), preview.HighlightPath(s.previewRoot, newRel))
			if oldSprite, rows, cols, ok := preview.FindSprite(s.previewRoot, relPath); ok {
				copyPreviewIfExists(oldSprite, preview.SpritePath(s.previewRoot, newRel, rows, cols))
			}
		}
	case inLib:
		movePreviewIfExists(preview.ThumbnailPath(s.previewRoot, relPath), preview.ThumbnailPath(s.previewRoot, newRel))
		movePreviewIfExists(preview.HighlightPath(s.previewRoot, relPath), preview.HighlightPath(s.previewRoot, newRel))
		if oldSprite, rows, cols, ok := preview.FindSprite(s.previewRoot, relPath); ok {
			movePreviewIfExists(oldSprite, preview.SpritePath(s.previewRoot, newRel, rows, cols))
		}
		if err := s.store.UpdateMediaPath(relPath, newRel); err != nil {
			http.Error(w, "failed to update media row", http.StatusInternalServerError)
			return
		}
	default:
		os.Remove(preview.ThumbnailPath(s.previewRoot, relPath))
		os.Remove(preview.HighlightPath(s.previewRoot, relPath))
		preview.RemoveSprites(s.previewRoot, relPath, "")
		if err := s.store.DeleteMedia(relPath); err != nil {
			http.Error(w, "failed to delete media row", http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(moveResponse{Path: newRel, InLibrary: inLib})
}

// movePreviewIfExists is renamePreviewIfExists for a destination whose
// parent directory may not exist yet.
func movePreviewIfExists(oldPath, newPath string) {
	if _, err := os.Stat(oldPath); err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(newPath), 0o755); err != nil {
		return
	}
	os.Rename(oldPath, newPath)
}

// copyFile copies src to dst via a temp file in dst's directory, so an
// overwrite is atomic and a failed copy never leaves a partial dst. The
// source mtime is preserved (the media row's mdate mirrors it).
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	fi, err := in.Stat()
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(dst), ".copy-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // no-op after a successful rename
	if _, err := io.Copy(tmp, in); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), fi.Mode().Perm()); err != nil {
		return err
	}
	if err := os.Chtimes(tmp.Name(), fi.ModTime(), fi.ModTime()); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), dst)
}

// copyPreviewIfExists is movePreviewIfExists for copies; best-effort.
func copyPreviewIfExists(oldPath, newPath string) {
	if _, err := os.Stat(oldPath); err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(newPath), 0o755); err != nil {
		return
	}
	copyFile(oldPath, newPath)
}
