package shuffle

import (
	"testing"

	"mediagrid/internal/model"
)

func TestToCacheRows_StripsToLeanShape(t *testing.T) {
	rows := []Row{
		{RowI: 0, H: 200, Tiles: []Tile{
			{TileI: 0, W: 100, Path: "a.jpg", IsVid: false, Id: 7},
			{TileI: 1, W: 150, Path: "b.jpg", IsVid: true, Id: 9},
		}},
	}

	got := ToCacheRows(rows)

	want := []CacheTile{{TileI: 0, W: 100, Id: 7}, {TileI: 1, W: 150, Id: 9}}
	if len(got) != 1 || len(got[0].Tiles) != 2 {
		t.Fatalf("got %+v, want 1 row with 2 tiles", got)
	}
	for i, tile := range got[0].Tiles {
		if tile != want[i] {
			t.Fatalf("tile %d: got %+v, want %+v", i, tile, want[i])
		}
	}
}

func TestHydrateRows_RebuildsFullTileFromMedia(t *testing.T) {
	cacheRows := []CacheRow{
		{RowI: 0, H: 300, Tiles: []CacheTile{{TileI: 0, W: 120, Id: 5}}},
	}
	media := map[int]model.Media{
		5: {Id: 5, Path: "clip.mp4", Width: 1920, Height: 1080, Filesize: 999, Mdate: 111, Duration: 8, IsVid: true},
	}

	rows := HydrateRows(cacheRows, media)

	if len(rows) != 1 || len(rows[0].Tiles) != 1 {
		t.Fatalf("got %+v, want 1 row with 1 tile", rows)
	}
	tile := rows[0].Tiles[0]
	// Layout fields (TileI/W) come from the cached row, not the media lookup.
	if tile.TileI != 0 || tile.W != 120 {
		t.Fatalf("tile did not preserve cached layout fields: %+v", tile)
	}
	if tile.Path != "clip.mp4" || !tile.IsVid || tile.Duration != 8 || tile.Filesize != 999 || tile.Mdate != 111 {
		t.Fatalf("tile did not hydrate from media: %+v", tile)
	}
	if tile.Preview.W != 1920 || tile.Preview.H != 1080 {
		t.Fatalf("tile preview dims not hydrated: %+v", tile.Preview)
	}
}

// A cached Id with no matching media row (the file was deleted via
// /api/delete after this shufflelist was cached) must synthesize a
// DeletedPath placeholder with zero-value fields rather than erroring —
// AUTOINCREMENT guarantees the id will never silently resolve to a
// different file.
func TestHydrateRows_MissingIdSynthesizesDeletedPlaceholder(t *testing.T) {
	cacheRows := []CacheRow{
		{RowI: 0, H: 300, Tiles: []CacheTile{{TileI: 0, W: 120, Id: 404}}},
	}

	rows := HydrateRows(cacheRows, map[int]model.Media{})

	tile := rows[0].Tiles[0]
	if tile.Path != DeletedPath {
		t.Fatalf("got Path=%q, want %q", tile.Path, DeletedPath)
	}
	if tile.TileI != 0 || tile.W != 120 {
		t.Fatalf("deleted tile should still preserve cached layout fields: %+v", tile)
	}
	if tile.Filesize != 0 || tile.Mdate != 0 || tile.IsVid || tile.Duration != 0 || tile.Preview != (PreviewData{}) {
		t.Fatalf("deleted tile should have zero-value fields: %+v", tile)
	}
}
