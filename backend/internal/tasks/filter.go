package tasks

import (
	"strings"

	"mediagrid/internal/model"
	"mediagrid/internal/shuffle"
)

// buildFilterParams turns a gen-task's SimpleFilter text and (optional)
// PresetFilter selection into shuffle.Params, mirroring the frontend's
// buildShuffleQuery.ts. If usePresetFilter is false or presetName is empty,
// only the SimpleFilter applies.
func buildFilterParams(d Deps, filterText string, usePresetFilter bool, presetName string) (shuffle.Params, error) {
	params := shuffle.Params{F: filterText}
	if !usePresetFilter || presetName == "" {
		return params, nil
	}

	preset, err := findPreset(d, presetName)
	if err != nil {
		return params, err
	}
	if preset == nil {
		// Preset no longer exists; fall back to SimpleFilter only.
		return params, nil
	}

	params.ExVids = !preset.IncludeVids
	params.ExImgs = !preset.IncludeImages
	params.ExPort = !preset.IncludePortrait
	params.ExLand = !preset.IncludeLandscape
	params.MinDur = preset.MinDuration
	params.MaxDur = preset.MaxDuration
	params.Whitelist = splitCSV(preset.WhitelistCSV)
	params.Blacklist = splitCSV(preset.BlacklistCSV)
	params.BasePath = preset.BasePath
	return params, nil
}

// findPreset looks up a preset by name, synthesizing "default" (mirroring
// GET /api/presets) if it hasn't been explicitly saved.
func findPreset(d Deps, name string) (*model.Preset, error) {
	presets, err := d.Store.ListPresets()
	if err != nil {
		return nil, err
	}
	for i := range presets {
		if presets[i].Name == name {
			return &presets[i], nil
		}
	}
	if name == "default" {
		p := model.DefaultPreset("default")
		return &p, nil
	}
	return nil, nil
}

func splitCSV(csv string) []string {
	parts := strings.Split(csv, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
