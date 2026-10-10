package scan

import (
	"os"
	"path/filepath"
	"testing"

	"mediagrid/internal/library"
	"mediagrid/internal/model"
)

func TestParseProbeOutput_Image(t *testing.T) {
	json := `{
		"streams": [
			{"codec_type": "video", "width": 800, "height": 600}
		],
		"format": {}
	}`
	width, height, duration, err := parseProbeOutput([]byte(json), false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if width != 800 || height != 600 {
		t.Fatalf("got %dx%d, want 800x600", width, height)
	}
	if duration != 0 {
		t.Fatalf("got duration %d, want 0 for image", duration)
	}
}

func TestParseProbeOutput_VideoWithDuration(t *testing.T) {
	json := `{
		"streams": [
			{"codec_type": "audio"},
			{"codec_type": "video", "width": 1920, "height": 1080}
		],
		"format": {"duration": "12.6"}
	}`
	width, height, duration, err := parseProbeOutput([]byte(json), true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if width != 1920 || height != 1080 {
		t.Fatalf("got %dx%d, want 1920x1080", width, height)
	}
	if duration != 13 {
		t.Fatalf("got duration %d, want 13 (rounded from 12.6)", duration)
	}
}

func TestParseProbeOutput_RotateTagSwapsDimensions(t *testing.T) {
	json := `{
		"streams": [
			{"codec_type": "video", "width": 1920, "height": 1080, "tags": {"rotate": "90"}}
		],
		"format": {"duration": "5"}
	}`
	width, height, _, err := parseProbeOutput([]byte(json), true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if width != 1080 || height != 1920 {
		t.Fatalf("got %dx%d, want swapped 1080x1920", width, height)
	}
}

func TestParseProbeOutput_SideDataRotationSwapsDimensions(t *testing.T) {
	json := `{
		"streams": [
			{"codec_type": "video", "width": 1920, "height": 1080, "side_data_list": [{"rotation": -90}]}
		],
		"format": {"duration": "5"}
	}`
	width, height, _, err := parseProbeOutput([]byte(json), true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if width != 1080 || height != 1920 {
		t.Fatalf("got %dx%d, want swapped 1080x1920", width, height)
	}
}

func TestParseProbeOutput_180RotationDoesNotSwap(t *testing.T) {
	json := `{
		"streams": [
			{"codec_type": "video", "width": 1920, "height": 1080, "tags": {"rotate": "180"}}
		],
		"format": {"duration": "5"}
	}`
	width, height, _, err := parseProbeOutput([]byte(json), true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if width != 1920 || height != 1080 {
		t.Fatalf("got %dx%d, want unswapped 1920x1080", width, height)
	}
}

func TestParseProbeOutput_NoVideoStreamErrors(t *testing.T) {
	json := `{"streams": [{"codec_type": "audio"}], "format": {}}`
	if _, _, _, err := parseProbeOutput([]byte(json), false); err == nil {
		t.Fatal("expected an error when no video/image stream is present")
	}
}

func TestWalkCandidates_RespectsLibraryFilter(t *testing.T) {
	root := t.TempDir()
	for _, f := range []string{"keep/a.jpg", "keep/tmp/b.jpg", "skip/c.jpg", "keepsake.jpg"} {
		p := filepath.Join(root, f)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, nil, 0o644); err != nil {
			t.Fatal(err)
		}
	}

	var got []string
	lib := library.New(model.LibrarySettings{WhitelistCSV: "keep/", BlacklistCSV: "keep/tmp"})
	err := walkCandidates(nil, root, lib, func(rel string, isVid bool) error {
		got = append(got, filepath.ToSlash(rel))
		return nil
	})
	if err != nil {
		t.Fatalf("walk: %v", err)
	}
	if len(got) != 1 || got[0] != "keep/a.jpg" {
		t.Fatalf("got %v, want [keep/a.jpg]", got)
	}
}
