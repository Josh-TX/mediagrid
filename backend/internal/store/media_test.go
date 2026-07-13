package store

import (
	"testing"

	"mediagrid/internal/model"
)

func TestListAllMedia_PopulatesId(t *testing.T) {
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer s.DB.Close()

	if err := s.InsertMedia(model.Media{Path: "a.jpg", Width: 10, Height: 10, Filesize: 1, Mdate: 1}); err != nil {
		t.Fatalf("InsertMedia: %v", err)
	}
	if err := s.InsertMedia(model.Media{Path: "b.jpg", Width: 10, Height: 10, Filesize: 2, Mdate: 2}); err != nil {
		t.Fatalf("InsertMedia: %v", err)
	}

	all, err := s.ListAllMedia()
	if err != nil {
		t.Fatalf("ListAllMedia: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("got %d rows, want 2", len(all))
	}
	seen := map[string]int{}
	for _, m := range all {
		if m.Id == 0 {
			t.Fatalf("media %+v has zero Id", m)
		}
		seen[m.Path] = m.Id
	}
	// AUTOINCREMENT assigns ids in insertion order starting at 1.
	if seen["a.jpg"] != 1 || seen["b.jpg"] != 2 {
		t.Fatalf("got ids %+v, want a.jpg=1 b.jpg=2", seen)
	}
}

func TestGetMediaByIDs_OmitsUnmatchedIdsRatherThanErroring(t *testing.T) {
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer s.DB.Close()

	if err := s.InsertMedia(model.Media{Path: "a.jpg", Width: 10, Height: 10}); err != nil {
		t.Fatalf("InsertMedia: %v", err)
	}
	if err := s.InsertMedia(model.Media{Path: "b.jpg", Width: 20, Height: 20}); err != nil {
		t.Fatalf("InsertMedia: %v", err)
	}
	all, err := s.ListAllMedia()
	if err != nil {
		t.Fatalf("ListAllMedia: %v", err)
	}
	aId, bId := all[0].Id, all[1].Id

	// 999 doesn't correspond to any row (simulating a stale cached id whose
	// media was deleted) and should simply be absent from the result rather
	// than causing an error.
	got, err := s.GetMediaByIDs([]int{aId, 999})
	if err != nil {
		t.Fatalf("GetMediaByIDs: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d results, want 1", len(got))
	}
	if m, ok := got[aId]; !ok || m.Path != "a.jpg" {
		t.Fatalf("got %+v, want a.jpg at id %d", got, aId)
	}
	if _, ok := got[bId]; ok {
		t.Fatalf("got bId=%d present, want it excluded since it wasn't requested", bId)
	}
}

func TestGetMediaByIDs_EmptyInputReturnsEmptyMap(t *testing.T) {
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer s.DB.Close()

	got, err := s.GetMediaByIDs(nil)
	if err != nil {
		t.Fatalf("GetMediaByIDs: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("got %+v, want empty", got)
	}
}
