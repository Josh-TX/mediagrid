package api

import (
	"encoding/json"
	"net/http"

	"mediagrid/internal/model"
)

type libraryResponse struct {
	MediaRoot string `json:"mediaRoot"`
	DataRoot  string `json:"dataRoot"`
	model.LibrarySettings
}

// handleGetLibrary returns the read-only media/data roots plus the saved
// library whitelist/blacklist. Called when the Library tab opens.
func (s *Server) handleGetLibrary(w http.ResponseWriter, r *http.Request) {
	ls, err := s.store.GetLibrarySettings()
	if err != nil {
		http.Error(w, "failed to load library settings", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(libraryResponse{MediaRoot: s.mediaRoot, DataRoot: s.previewRoot, LibrarySettings: ls})
}

func (s *Server) handlePostLibrary(w http.ResponseWriter, r *http.Request) {
	var ls model.LibrarySettings
	if err := json.NewDecoder(r.Body).Decode(&ls); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if err := s.store.SaveLibrarySettings(ls); err != nil {
		http.Error(w, "failed to save library settings", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
