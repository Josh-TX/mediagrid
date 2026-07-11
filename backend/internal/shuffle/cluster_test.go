package shuffle

import (
	"fmt"
	"testing"

	"mediagrid/internal/model"
)

// wide returns a media item with aspect ratio 3 (e.g. an ultrawide photo).
func wide(path string) model.Media {
	return model.Media{Path: path, Width: 3000, Height: 1000}
}

func TestKmeans1D_SeparatesDistinctAspectRatioGroups(t *testing.T) {
	var media []model.Media
	for i := 0; i < 6; i++ {
		media = append(media, square(string(rune('a'+i))))
	}
	for i := 0; i < 6; i++ {
		media = append(media, wide(string(rune('m'+i))))
	}

	clusters := kmeans1D(media, 5)

	// Every cluster's members should all share the same aspect ratio group
	// (square vs wide) — k-means shouldn't mix the two visually distinct
	// groups into the same cluster.
	for _, c := range clusters {
		first := c.media[0].AspectRatio()
		for _, m := range c.media[1:] {
			if m.AspectRatio() != first {
				t.Fatalf("cluster mixed aspect ratios %v and %v", first, m.AspectRatio())
			}
		}
	}

	total := 0
	for _, c := range clusters {
		total += len(c.media)
	}
	if total != len(media) {
		t.Fatalf("clusters contain %d media total, want %d", total, len(media))
	}
}

func TestDissolveClusters_MergesUndersizedClusterIntoNearest(t *testing.T) {
	// One lone square tile can't fill a row by itself (screen 1000x1000,
	// tilePct=0.3 needs 2 square tiles per row). It should get dissolved
	// into the (much larger, and aspect-ratio-closer) square-ish cluster
	// rather than staying isolated.
	clusters := []cluster{
		{media: []model.Media{square("solo")}, centroid: 1.0},
		{media: repeatMedia(square, 20), centroid: 1.0},
		{media: repeatMedia(wide, 20), centroid: 3.0},
	}

	survivors := dissolveClusters(clusters, 1000, 1000, 0.3)

	if len(survivors) != 2 {
		t.Fatalf("got %d surviving clusters, want 2 (solo cluster dissolved away)", len(survivors))
	}
	total := 0
	for _, c := range survivors {
		total += len(c.media)
	}
	if total != 41 {
		t.Fatalf("survivors contain %d media total, want 41 (no tiles lost)", total)
	}
}

func TestPackClusterRows_IncompleteTrailingRowGoesToLeftover(t *testing.T) {
	media := repeatMedia(square, 5) // closes every 2 tiles -> 2 rows + 1 leftover
	rows, leftover := packClusterRows(media, 1000, 1000, 0.3)

	if len(rows) != 2 {
		t.Fatalf("got %d rows, want 2", len(rows))
	}
	if len(leftover) != 1 {
		t.Fatalf("got %d leftover tiles, want 1", len(leftover))
	}
}

func TestPackClusterRows_TooSmallForEvenOneRowReturnsAllAsLeftover(t *testing.T) {
	media := repeatMedia(square, 1)
	rows, leftover := packClusterRows(media, 1000, 1000, 0.3)

	if len(rows) != 0 {
		t.Fatalf("got %d rows, want 0", len(rows))
	}
	if len(leftover) != 1 {
		t.Fatalf("got %d leftover tiles, want 1", len(leftover))
	}
}

func TestBuildRandomRows_PreservesAllTiles(t *testing.T) {
	var media []model.Media
	media = append(media, repeatMedia(square, 17)...)
	media = append(media, repeatMedia(wide, 9)...)
	media = append(media, model.Media{Path: "solo-tall", Width: 500, Height: 2000})

	rows := BuildRandomRows(media, 1000, 1000, 0.3)

	total := 0
	for _, r := range rows {
		total += len(r.Tiles)
	}
	if total != len(media) {
		t.Fatalf("output has %d tiles, want %d (input size)", total, len(media))
	}
}

func TestBuildRandomRows_PureRowsAreHomogeneous(t *testing.T) {
	// 40 square + 40 wide tiles both divide evenly into rows of 2 (see
	// TestBuildRows_ClosesRowWhenAverageAreaDropsToThreshold for the math),
	// so there should be zero leftover tiles and every row should contain
	// tiles of only one aspect ratio.
	var media []model.Media
	media = append(media, repeatMedia(square, 40)...)
	media = append(media, repeatMedia(wide, 40)...)

	rows := BuildRandomRows(media, 1000, 1000, 0.3)

	if len(rows) != 40 {
		t.Fatalf("got %d rows, want 40 (20 square-pairs + 20 wide-pairs, no impure remainder)", len(rows))
	}
	for _, r := range rows {
		if len(r.Tiles) != 2 {
			t.Fatalf("row %+v has %d tiles, want 2 (every row should be pure/complete)", r, len(r.Tiles))
		}
		ar0 := r.Tiles[0].Preview.W / r.Tiles[0].Preview.H
		ar1 := r.Tiles[1].Preview.W / r.Tiles[1].Preview.H
		if ar0 != ar1 {
			t.Fatalf("row mixes aspect ratios: %+v", r)
		}
	}
}

func TestBuildRandomRows_ImpureRowAppendedAtEnd(t *testing.T) {
	// 41 identical-aspect-ratio square tiles: 20 complete pure rows (2 tiles
	// each) plus 1 leftover tile that can't complete a row on its own. That
	// leftover must land in a single impure row at the very end.
	media := repeatMedia(square, 41)

	rows := BuildRandomRows(media, 1000, 1000, 0.3)

	if len(rows) != 21 {
		t.Fatalf("got %d rows, want 21 (20 pure + 1 impure)", len(rows))
	}
	for i := 0; i < 20; i++ {
		if len(rows[i].Tiles) != 2 {
			t.Fatalf("row %d has %d tiles, want 2 (pure rows come first)", i, len(rows[i].Tiles))
		}
	}
	last := rows[len(rows)-1]
	if len(last.Tiles) != 1 {
		t.Fatalf("last row has %d tiles, want 1 (the leftover impure row)", len(last.Tiles))
	}
}

func TestBuildRandomRows_RenumbersRowsAndTilesSequentially(t *testing.T) {
	media := repeatMedia(square, 41)
	rows := BuildRandomRows(media, 1000, 1000, 0.3)

	wantTileI := 0
	for i, r := range rows {
		if r.RowI != i {
			t.Fatalf("row.RowI = %d, want %d", r.RowI, i)
		}
		for _, tile := range r.Tiles {
			if tile.TileI != wantTileI {
				t.Fatalf("tile.TileI = %d, want %d", tile.TileI, wantTileI)
			}
			wantTileI++
		}
	}
}

func TestBuildRandomRows_EmptyInput(t *testing.T) {
	rows := BuildRandomRows(nil, 1000, 1000, 0.3)
	if len(rows) != 0 {
		t.Fatalf("got %d rows, want 0", len(rows))
	}
}

func repeatMedia(factory func(string) model.Media, n int) []model.Media {
	result := make([]model.Media, n)
	for i := range result {
		result[i] = factory(fmt.Sprintf("m%d", i))
	}
	return result
}
