package shuffle

import (
	"testing"

	"mediagrid/internal/model"
)

func TestDefaultDir(t *testing.T) {
	cases := map[string]string{
		"size": "desc",
		"date": "desc",
		"az":   "asc",
	}
	for sortType, want := range cases {
		if got := DefaultDir(sortType); got != want {
			t.Errorf("DefaultDir(%q) = %q, want %q", sortType, got, want)
		}
	}
}

func TestSort_Size(t *testing.T) {
	media := []model.Media{
		{Path: "a", Filesize: 300},
		{Path: "b", Filesize: 100},
		{Path: "c", Filesize: 200},
	}
	assertPaths(t, Sort(media, "size", "asc"), []string{"b", "c", "a"})
	assertPaths(t, Sort(media, "size", "desc"), []string{"a", "c", "b"})
}

func TestSort_AZByFullPathCaseInsensitive(t *testing.T) {
	media := []model.Media{
		{Path: "Banana.jpg"},
		{Path: "apple.jpg"},
		{Path: "cherry.jpg"},
	}
	assertPaths(t, Sort(media, "az", "asc"), []string{"apple.jpg", "Banana.jpg", "cherry.jpg"})
}

func TestSort_Date(t *testing.T) {
	media := []model.Media{
		{Path: "old", Mdate: 100},
		{Path: "new", Mdate: 300},
		{Path: "mid", Mdate: 200},
	}
	assertPaths(t, Sort(media, "date", "desc"), []string{"new", "mid", "old"})
}

func TestSort_DoesNotMutateInput(t *testing.T) {
	media := []model.Media{{Path: "b", Filesize: 2}, {Path: "a", Filesize: 1}}
	_ = Sort(media, "az", "asc")
	if media[0].Path != "b" || media[1].Path != "a" {
		t.Fatalf("Sort mutated its input slice: %v", media)
	}
}

func TestRandOrder_ContainsAllElementsExactlyOnce(t *testing.T) {
	media := []model.Media{{Path: "a"}, {Path: "b"}, {Path: "c"}, {Path: "d"}}
	got := RandOrder(media)
	if len(got) != len(media) {
		t.Fatalf("got %d items, want %d", len(got), len(media))
	}
	seen := map[string]bool{}
	for _, m := range got {
		seen[m.Path] = true
	}
	for _, m := range media {
		if !seen[m.Path] {
			t.Fatalf("RandOrder lost element %q", m.Path)
		}
	}
}
