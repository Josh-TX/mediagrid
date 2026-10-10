package store

import (
	"testing"

	"mediagrid/internal/model"
)

func TestLibrarySettings_DefaultsEmptyThenRoundTrips(t *testing.T) {
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer s.DB.Close()

	got, err := s.GetLibrarySettings()
	if err != nil || got != (model.LibrarySettings{}) {
		t.Fatalf("fresh DB: got %+v, err %v; want zero value", got, err)
	}

	want := model.LibrarySettings{WhitelistCSV: "a/,b/", BlacklistCSV: "a/tmp", WhitelistContainsCSV: "x", BlacklistContainsCSV: "y"}
	if err := s.SaveLibrarySettings(want); err != nil {
		t.Fatalf("save: %v", err)
	}
	want.BlacklistCSV = ""
	if err := s.SaveLibrarySettings(want); err != nil {
		t.Fatalf("resave: %v", err)
	}
	got, err = s.GetLibrarySettings()
	if err != nil || got != want {
		t.Fatalf("got %+v, err %v; want %+v", got, err, want)
	}
}
