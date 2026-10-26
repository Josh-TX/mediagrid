package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

type lsEntry struct {
	Name  string `json:"name"`
	IsDir bool   `json:"isDir"`
}

type lsResponse struct {
	// Path is the canonical, normalized directory ("/" is the media root,
	// otherwise "/a/b" with no trailing slash).
	Path string `json:"path"`
	// Exists is false for a well-formed path that isn't a directory yet (the
	// move picker treats those as "folder will be created").
	Exists  bool      `json:"exists"`
	Entries []lsEntry `json:"entries"`
}

// canonicalDir normalizes a client-supplied directory ("/a//b/", "a/../b")
// to "/"-rooted slash form.
func canonicalDir(p string) (string, bool) {
	p = strings.ReplaceAll(p, "\\", "/")
	// Cleaning a "/"-rooted path can't climb above "/", so no escape check.
	return path.Clean("/" + p), true
}

// handleLs lists the directory given by ?path= (relative to the media root),
// folders and files alike, sorted by name. Backs the move modal's picker.
func (s *Server) handleLs(w http.ResponseWriter, r *http.Request) {
	dir, ok := canonicalDir(r.URL.Query().Get("path"))
	if !ok {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	full := filepath.Join(s.mediaRoot, filepath.FromSlash(dir))
	if !pathWithinRoot(s.mediaRoot, full) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	resp := lsResponse{Path: dir, Entries: []lsEntry{}}
	des, err := os.ReadDir(full)
	if err == nil {
		resp.Exists = true
		for _, de := range des {
			isDir := de.IsDir()
			if de.Type()&os.ModeSymlink != 0 {
				if fi, err := os.Stat(filepath.Join(full, de.Name())); err == nil {
					isDir = fi.IsDir()
				}
			}
			resp.Entries = append(resp.Entries, lsEntry{Name: de.Name(), IsDir: isDir})
		}
		sort.Slice(resp.Entries, func(i, j int) bool {
			return strings.ToLower(resp.Entries[i].Name) < strings.ToLower(resp.Entries[j].Name)
		})
	} else if !os.IsNotExist(err) {
		// Exists but isn't a readable dir (e.g. it's a file, or no permission).
		if fi, serr := os.Stat(full); serr == nil && !fi.IsDir() {
			http.Error(w, "not a directory", http.StatusBadRequest)
			return
		}
		http.Error(w, "failed to list directory", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
