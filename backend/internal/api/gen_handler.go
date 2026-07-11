package api

import (
	"encoding/json"
	"net/http"

	"mediagrid/internal/model"
)

type genSettingsResponse struct {
	Thumbnail model.ThumbnailSettings `json:"thumbnail"`
	Highlight model.HighlightSettings `json:"highlight"`
}

// handleGetGenSettings returns the last-saved thumbnail/highlight
// generation settings (or hardcoded defaults if never saved). Called only
// when a gen-settings inner modal opens. If a saved "use preset filter"
// selection refers to a preset that's since been deleted, it's silently
// cleared rather than surfaced as an error.
func (s *Server) handleGetGenSettings(w http.ResponseWriter, r *http.Request) {
	thumbJSON, highlightJSON, err := s.store.GetGenSettings()
	if err != nil {
		http.Error(w, "failed to load gen settings", http.StatusInternalServerError)
		return
	}

	resp := genSettingsResponse{
		Thumbnail: model.DefaultThumbnailSettings(),
		Highlight: model.DefaultHighlightSettings(),
	}
	if thumbJSON != "" {
		json.Unmarshal([]byte(thumbJSON), &resp.Thumbnail)
	}
	if highlightJSON != "" {
		json.Unmarshal([]byte(highlightJSON), &resp.Highlight)
	}

	if resp.Thumbnail.UsePresetFilter && !s.presetExists(resp.Thumbnail.PresetName) {
		resp.Thumbnail.UsePresetFilter = false
		resp.Thumbnail.PresetName = ""
	}
	if resp.Highlight.UsePresetFilter && !s.presetExists(resp.Highlight.PresetName) {
		resp.Highlight.UsePresetFilter = false
		resp.Highlight.PresetName = ""
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// presetExists reports whether name is a real preset. "default" always
// counts, since it's synthesized on every GET /api/presets even before
// it's ever explicitly saved.
func (s *Server) presetExists(name string) bool {
	if name == "" {
		return false
	}
	if name == "default" {
		return true
	}
	presets, err := s.store.ListPresets()
	if err != nil {
		return false
	}
	for _, p := range presets {
		if p.Name == name {
			return true
		}
	}
	return false
}

// handleGenThumbnails saves settings (so the modal can prefill from it next
// time) and enqueues a Gen Thumbnails task, returning immediately.
func (s *Server) handleGenThumbnails(w http.ResponseWriter, r *http.Request) {
	var settings model.ThumbnailSettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		http.Error(w, "failed to encode settings", http.StatusInternalServerError)
		return
	}
	if err := s.store.SaveThumbnailSettings(string(settingsJSON)); err != nil {
		http.Error(w, "failed to save gen settings", http.StatusInternalServerError)
		return
	}

	t := s.tasks.NewGenThumbnailsTask(settings)
	s.tasks.Enqueue(t)
	w.WriteHeader(http.StatusNoContent)
}

// handleGenHighlights saves settings and enqueues a Gen Highlights task,
// returning immediately.
func (s *Server) handleGenHighlights(w http.ResponseWriter, r *http.Request) {
	var settings model.HighlightSettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		http.Error(w, "failed to encode settings", http.StatusInternalServerError)
		return
	}
	if err := s.store.SaveHighlightSettings(string(settingsJSON)); err != nil {
		http.Error(w, "failed to save gen settings", http.StatusInternalServerError)
		return
	}

	t := s.tasks.NewGenHighlightsTask(settings)
	s.tasks.Enqueue(t)
	w.WriteHeader(http.StatusNoContent)
}
