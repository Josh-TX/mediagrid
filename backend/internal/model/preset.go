package model

// Preset bundles the media Filter settings under a unique Name. It is
// stored as one row (one column per field) in the `presets` table and
// round-trips as-is through GET/POST /api/presets.
type Preset struct {
	Name string `json:"name"`

	IncludeVids      bool   `json:"includeVids"`
	IncludeImages    bool   `json:"includeImages"`
	IncludePortrait  bool   `json:"includePortrait"`
	IncludeLandscape bool   `json:"includeLandscape"`
	MinDuration      int    `json:"minDuration"`
	MaxDuration      int    `json:"maxDuration"`
	WhitelistCSV     string `json:"whitelistCSV"`
	BlacklistCSV     string `json:"blacklistCSV"`
	BasePath         string `json:"basePath"`
}

func DefaultPreset(name string) Preset {
	return Preset{
		Name: name,

		IncludeVids:      true,
		IncludeImages:    true,
		IncludePortrait:  true,
		IncludeLandscape: true,
		MinDuration:      0,
		MaxDuration:      0,
		WhitelistCSV:     "",
		BlacklistCSV:     "",
		BasePath:         "",
	}
}
