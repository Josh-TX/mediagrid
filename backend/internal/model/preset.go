package model

// Preset bundles Gallery, Filter, and Player settings under a unique Name.
// It is stored as one row (one column per field) in the `presets` table and
// round-trips as-is through GET/POST /api/presets.
type Preset struct {
	Name string `json:"name"`

	// Gallery settings
	TilePct            float64 `json:"tilePct"`
	TileCropX          float64 `json:"tileCropX"`
	TileCropY          float64 `json:"tileCropY"`
	DefaultSort        string  `json:"defaultSort"`
	AutoPlayTile       string  `json:"autoPlayTile"`
	FallbackToOriginal bool    `json:"fallbackToOriginal"`

	// Filter settings
	IncludeVids      bool   `json:"includeVids"`
	IncludeImages    bool   `json:"includeImages"`
	IncludePortrait  bool   `json:"includePortrait"`
	IncludeLandscape bool   `json:"includeLandscape"`
	MinDuration      int    `json:"minDuration"`
	MaxDuration      int    `json:"maxDuration"`
	WhitelistCSV     string `json:"whitelistCSV"`
	BlacklistCSV     string `json:"blacklistCSV"`
	BasePath         string `json:"basePath"`

	// Player settings (stored only; Player is out of scope for this spec)
	OnVidEnd       string  `json:"onVidEnd"`
	PlayerCropX    float64 `json:"playerCropX"`
	PlayerCropY    float64 `json:"playerCropY"`
	RewindSeconds  int     `json:"rewindSeconds"`
	ForwardSeconds int     `json:"forwardSeconds"`
}

func DefaultPreset(name string) Preset {
	return Preset{
		Name: name,

		TilePct:            0.15,
		TileCropX:          0.1,
		TileCropY:          0.1,
		DefaultSort:        "rand",
		AutoPlayTile:       "off",
		FallbackToOriginal: true,

		IncludeVids:      true,
		IncludeImages:    true,
		IncludePortrait:  true,
		IncludeLandscape: true,
		MinDuration:      0,
		MaxDuration:      0,
		WhitelistCSV:     "",
		BlacklistCSV:     "",
		BasePath:         "",

		OnVidEnd:       "next",
		PlayerCropX:    0.2,
		PlayerCropY:    0.2,
		RewindSeconds:  10,
		ForwardSeconds: 10,
	}
}
