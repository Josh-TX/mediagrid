package store

import "testing"

// GenSettings has exactly one row shared by both settings types; saving one
// must not clobber the other. This is the tricky part of the upsert logic
// (see gen_settings.go), so it's worth testing directly.
func TestGenSettings_SavingOneTypeDoesNotClobberTheOther(t *testing.T) {
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer s.DB.Close()

	thumb, highlight, err := s.GetGenSettings()
	if err != nil {
		t.Fatalf("GetGenSettings: %v", err)
	}
	if thumb != "" || highlight != "" {
		t.Fatalf("expected empty settings before any save, got %q / %q", thumb, highlight)
	}

	if err := s.SaveThumbnailSettings(`{"quality":50}`); err != nil {
		t.Fatalf("SaveThumbnailSettings: %v", err)
	}
	thumb, highlight, err = s.GetGenSettings()
	if err != nil {
		t.Fatalf("GetGenSettings: %v", err)
	}
	if thumb != `{"quality":50}` || highlight != "" {
		t.Fatalf("got %q / %q, want saved thumbnail settings and still-empty highlight settings", thumb, highlight)
	}

	if err := s.SaveHighlightSettings(`{"segmentCount":5}`); err != nil {
		t.Fatalf("SaveHighlightSettings: %v", err)
	}
	thumb, highlight, err = s.GetGenSettings()
	if err != nil {
		t.Fatalf("GetGenSettings: %v", err)
	}
	if thumb != `{"quality":50}` {
		t.Fatalf("saving highlight settings clobbered thumbnail settings: got %q", thumb)
	}
	if highlight != `{"segmentCount":5}` {
		t.Fatalf("got highlight %q, want saved value", highlight)
	}

	if err := s.SaveThumbnailSettings(`{"quality":80}`); err != nil {
		t.Fatalf("SaveThumbnailSettings (update): %v", err)
	}
	thumb, highlight, err = s.GetGenSettings()
	if err != nil {
		t.Fatalf("GetGenSettings: %v", err)
	}
	if thumb != `{"quality":80}` || highlight != `{"segmentCount":5}` {
		t.Fatalf("got %q / %q, want updated thumbnail settings and preserved highlight settings", thumb, highlight)
	}
}
