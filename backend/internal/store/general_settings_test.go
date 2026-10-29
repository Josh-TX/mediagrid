package store

import (
	"database/sql"
	"path/filepath"
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
	want.VideoTileInitial = "sprite"
	want.AutoplayInitiallyOn = false
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

// Databases created before sprites have the removed tilePreviewAlways/
// fallbackToOriginal columns (NOT NULL, no default); opening must drop them
// and add the new ones so saving works.
func TestOpen_MigratesLegacyGeneralSettingsColumns(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE general_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tilePct REAL NOT NULL, tileCropX REAL NOT NULL, tileCropY REAL NOT NULL,
  defaultSort TEXT NOT NULL,
  tilePreviewAlways INTEGER NOT NULL,
  fallbackToOriginal INTEGER NOT NULL,
  autoplayInitiallyOn INTEGER NOT NULL,
  playerCropX REAL NOT NULL, playerCropY REAL NOT NULL,
  rewindSeconds INTEGER NOT NULL, forwardSeconds INTEGER NOT NULL
)`)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()

	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open legacy db: %v", err)
	}
	defer s.DB.Close()
	want := model.DefaultGeneralSettings()
	if err := s.SaveGeneralSettings(want); err != nil {
		t.Fatalf("SaveGeneralSettings after migration: %v", err)
	}
	got, ok, err := s.GetGeneralSettings()
	if err != nil || !ok || got != want {
		t.Fatalf("round trip: %+v ok=%v err=%v", got, ok, err)
	}
}
