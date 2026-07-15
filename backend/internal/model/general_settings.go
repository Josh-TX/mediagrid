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
	TilePreviewAlways  bool    `json:"tilePreviewAlways"`
	FallbackToOriginal bool    `json:"fallbackToOriginal"`

	// Player settings
	AutoplayInitiallyOn bool    `json:"autoplayInitiallyOn"`
	PlaybackSpeed1      float64 `json:"playbackSpeed1"`
	PlaybackSpeed2      float64 `json:"playbackSpeed2"`
	PlayerCropX         float64 `json:"playerCropX"`
	PlayerCropY         float64 `json:"playerCropY"`
	RewindSeconds       int     `json:"rewindSeconds"`
	ForwardSeconds      int     `json:"forwardSeconds"`
}

func DefaultGeneralSettings() GeneralSettings {
	return GeneralSettings{
		TilePct:            0.15,
		TileCropX:          0.1,
		TileCropY:          0.1,
		DefaultSort:        "rand",
		TilePreviewAlways:  false,
		FallbackToOriginal: true,

		AutoplayInitiallyOn: true,
		PlaybackSpeed1:      2,
		PlaybackSpeed2:      4,
		PlayerCropX:         0,
		PlayerCropY:         0,
		RewindSeconds:       10,
		ForwardSeconds:      10,
	}
}
