package model

// GeneralSettings bundles the Gallery and Player settings that apply
// globally (not per-preset). It is stored as a single row in the
// `general_settings` table and round-trips as-is through
// GET /api/settings (as the `general` field) and POST /api/general-settings.
type GeneralSettings struct {
	// Gallery settings
	TilePct            float64 `json:"tilePct"`
	TileCropX          float64 `json:"tileCropX"`
	TileCropY          float64 `json:"tileCropY"`
	DefaultSort        string  `json:"defaultSort"`
	AutoPlayTile       string  `json:"autoPlayTile"`
	FallbackToOriginal bool    `json:"fallbackToOriginal"`

	// Player settings
	OnVidEnd       string  `json:"onVidEnd"`
	PlayerCropX    float64 `json:"playerCropX"`
	PlayerCropY    float64 `json:"playerCropY"`
	RewindSeconds  int     `json:"rewindSeconds"`
	ForwardSeconds int     `json:"forwardSeconds"`
}

func DefaultGeneralSettings() GeneralSettings {
	return GeneralSettings{
		TilePct:            0.15,
		TileCropX:          0.1,
		TileCropY:          0.1,
		DefaultSort:        "rand",
		AutoPlayTile:       "off",
		FallbackToOriginal: true,

		OnVidEnd:       "next",
		PlayerCropX:    0.2,
		PlayerCropY:    0.2,
		RewindSeconds:  10,
		ForwardSeconds: 10,
	}
}
