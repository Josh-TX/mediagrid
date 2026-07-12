package api

import (
	"encoding/json"
	"net/http"

	"mediagrid/internal/model"
)

type settingsResponse struct {
	General model.GeneralSettings `json:"general"`
	Presets []model.Preset        `json:"presets"`
}

// handleGetSettings returns the global general settings plus the full list
// of presets, in one call. If a general settings row hasn't been saved yet,
// or no preset named "default" exists, both are synthesized in-memory here
// (never persisted) — the same fallback behavior GET /api/presets used to
// provide just for the "default" preset.
func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
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
	if !hasDefault {
		presets = append(presets, model.DefaultPreset("default"))
	}

	general, exists, err := s.store.GetGeneralSettings()
	if err != nil {
		http.Error(w, "failed to load general settings", http.StatusInternalServerError)
		return
	}
	if !exists {
		general = model.DefaultGeneralSettings()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settingsResponse{General: general, Presets: presets})
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

func (s *Server) handlePostGeneralSettings(w http.ResponseWriter, r *http.Request) {
	var general model.GeneralSettings
	if err := json.NewDecoder(r.Body).Decode(&general); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := s.store.SaveGeneralSettings(general); err != nil {
		http.Error(w, "failed to save general settings", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
