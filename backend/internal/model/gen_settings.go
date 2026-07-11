package model

// ThumbnailSettings configures a Gen Thumbnails task. It round-trips as-is
// through GET /api/gen-settings and POST /api/gen-thumbnails, and is
// persisted (as JSON) in the gen_settings table on every submission.
type ThumbnailSettings struct {
	Quality         int    `json:"quality"`
	TargetPixels    int    `json:"targetPixels"`
	Override        bool   `json:"override"`
	Filter          string `json:"filter"`
	UsePresetFilter bool   `json:"usePresetFilter"`
	PresetName      string `json:"presetName"`
}

func DefaultThumbnailSettings() ThumbnailSettings {
	return ThumbnailSettings{
		Quality:         50,
		TargetPixels:    360000, // 600x600
		Override:        false,
		Filter:          "",
		UsePresetFilter: false,
		PresetName:      "",
	}
}

// HighlightSettings configures a Gen Highlights task. See ThumbnailSettings.
type HighlightSettings struct {
	TargetPixels    int     `json:"targetPixels"`
	Override        bool    `json:"override"`
	SegmentCount    int     `json:"segmentCount"`
	SegmentDuration float64 `json:"segmentDuration"`
	MaxProportion   float64 `json:"maxProportion"`
	FfmpegArgs      string  `json:"ffmpegArgs"`
	Filter          string  `json:"filter"`
	UsePresetFilter bool    `json:"usePresetFilter"`
	PresetName      string  `json:"presetName"`
}

func DefaultHighlightSettings() HighlightSettings {
	return HighlightSettings{
		TargetPixels:    360000, // 600x600
		Override:        false,
		SegmentCount:    5,
		SegmentDuration: 1.5,
		MaxProportion:   3,
		FfmpegArgs:      "-c:v libx264 -crf 25 -preset fast",
		Filter:          "",
		UsePresetFilter: false,
		PresetName:      "",
	}
}
