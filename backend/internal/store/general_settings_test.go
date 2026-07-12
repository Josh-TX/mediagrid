package store

import (
	"testing"

	"mediagrid/internal/model"
)

// GeneralSettings has exactly one row; confirm the "not saved yet" state is
// distinguishable from a saved row, and that saving replaces it wholesale.
func TestGeneralSettings_GetReturnsExistsFalseUntilSaved(t *testing.T) {
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer s.DB.Close()

	_, exists, err := s.GetGeneralSettings()
	if err != nil {
		t.Fatalf("GetGeneralSettings: %v", err)
	}
	if exists {
		t.Fatalf("expected exists=false before any save")
	}

	want := model.DefaultGeneralSettings()
	want.TilePct = 0.42
	want.DefaultSort = "az"
	if err := s.SaveGeneralSettings(want); err != nil {
		t.Fatalf("SaveGeneralSettings: %v", err)
	}

	got, exists, err := s.GetGeneralSettings()
	if err != nil {
		t.Fatalf("GetGeneralSettings: %v", err)
	}
	if !exists {
		t.Fatalf("expected exists=true after save")
	}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestGeneralSettings_SaveOverwritesPreviousRow(t *testing.T) {
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer s.DB.Close()

	first := model.DefaultGeneralSettings()
	first.RewindSeconds = 5
	if err := s.SaveGeneralSettings(first); err != nil {
		t.Fatalf("SaveGeneralSettings (first): %v", err)
	}

	second := model.DefaultGeneralSettings()
	second.RewindSeconds = 20
	if err := s.SaveGeneralSettings(second); err != nil {
		t.Fatalf("SaveGeneralSettings (second): %v", err)
	}

	got, _, err := s.GetGeneralSettings()
	if err != nil {
		t.Fatalf("GetGeneralSettings: %v", err)
	}
	if got.RewindSeconds != 20 {
		t.Fatalf("got RewindSeconds=%d, want 20 (second save should replace the first)", got.RewindSeconds)
	}
}
