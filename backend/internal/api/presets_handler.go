package api

import (
	"encoding/json"
	"net/http"

	"mediagrid/internal/model"
)

func (s *Server) handleGetPresets(w http.ResponseWriter, r *http.Request) {
	presets, err := s.store.ListPresets()
	if err != nil {
		http.Error(w, "failed to load presets", http.StatusInternalServerError)
		return
	}

	hasDefault := false
	for _, p := range presets {
		if p.Name == "default" {
			hasDefault = true
			break
		}
	}
	// Synthesized on every request until the user explicitly saves a preset
	// named "default" — never persisted here.
	if !hasDefault {
		presets = append(presets, model.DefaultPreset("default"))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(presets)
}

func (s *Server) handlePostPresets(w http.ResponseWriter, r *http.Request) {
	var presets []model.Preset
	if err := json.NewDecoder(r.Body).Decode(&presets); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := s.store.ReplacePresets(presets); err != nil {
		http.Error(w, "failed to save presets", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
