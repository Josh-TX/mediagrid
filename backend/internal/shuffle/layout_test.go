package shuffle

import (
	"mediagrid/internal/model"
	"testing"
)

// square returns a media item with an aspect ratio of exactly 1, so its
// rendered height always equals its rendered width.
func square(path string) model.Media {
	return model.Media{Path: path, Width: 1000, Height: 1000}
}

func TestBuildRows_PixelSplitMatchesSpecExample(t *testing.T) {
	// Spec example: screenW=1000 with 2 tiles -> available width 999,
	// split into 500px and 499px tiles.
	media := []model.Media{square("a"), square("b")}
	// tilePct=0 makes the area threshold unreachable, so both tiles land in
	// the same row (it only closes because no 3rd tile remains).
	rows := BuildRows(media, 1000, 1000, 0)

	if len(rows) != 1 {
		t.Fatalf("got %d rows, want 1", len(rows))
	}
	row := rows[0]
	if len(row.Tiles) != 2 {
		t.Fatalf("got %d tiles, want 2", len(row.Tiles))
	}
	if row.Tiles[0].W != 500 || row.Tiles[1].W != 499 {
		t.Fatalf("got widths %d,%d want 500,499", row.Tiles[0].W, row.Tiles[1].W)
	}
	// height = avg(500/1, 499/1) = 499.5, rounds to 500
	if row.H != 500 {
		t.Fatalf("got row height %d, want 500", row.H)
	}
}

func TestBuildRows_ClosesRowWhenAverageAreaDropsToThreshold(t *testing.T) {
	// With 3 square 1:1 tiles on a 1000x1000 screen:
	//   n=1: rowHeight=1000, avgArea=1,000,000
	//   n=2: widths 500/499, rowHeight=499.5, avgArea=249,750
	// threshold=300,000 (tilePct=0.3) sits between those, so the row should
	// grow from 1 to 2 tiles and then close, leaving the 3rd tile for row 2.
	media := []model.Media{square("a"), square("b"), square("c")}
	rows := BuildRows(media, 1000, 1000, 0.3)

	if len(rows) != 2 {
		t.Fatalf("got %d rows, want 2", len(rows))
	}
	if len(rows[0].Tiles) != 2 {
		t.Fatalf("row 0 got %d tiles, want 2", len(rows[0].Tiles))
	}
	if len(rows[1].Tiles) != 1 {
		t.Fatalf("row 1 got %d tiles, want 1", len(rows[1].Tiles))
	}
}

func TestBuildRows_NeverExceedsMaxTilesPerRow(t *testing.T) {
	// tilePct=0 makes the area threshold unreachable, so only maxTilesPerRow
	// (12) and running out of tiles can close a row.
	media := make([]model.Media, 15)
	for i := range media {
		media[i] = square(string(rune('a' + i)))
	}
	rows := BuildRows(media, 1000, 1000, 0)

	if len(rows) != 2 {
		t.Fatalf("got %d rows, want 2", len(rows))
	}
	if len(rows[0].Tiles) != 12 {
		t.Fatalf("row 0 got %d tiles, want 12 (maxTilesPerRow)", len(rows[0].Tiles))
	}
	if len(rows[1].Tiles) != 3 {
		t.Fatalf("row 1 got %d tiles, want 3", len(rows[1].Tiles))
	}
}

func TestBuildRows_AbsoluteRowAndTileIndices(t *testing.T) {
	media := make([]model.Media, 4)
	for i := range media {
		media[i] = square(string(rune('a' + i)))
	}
	// threshold tuned (as in the 3-tile test) so every row holds exactly 2 tiles
	rows := BuildRows(media, 1000, 1000, 0.3)

	if len(rows) != 2 {
		t.Fatalf("got %d rows, want 2", len(rows))
	}
	wantTileI := 0
	for rowi, row := range rows {
		if row.RowI != rowi {
			t.Fatalf("row.RowI = %d, want %d", row.RowI, rowi)
		}
		for _, tile := range row.Tiles {
			if tile.TileI != wantTileI {
				t.Fatalf("tile.TileI = %d, want %d", tile.TileI, wantTileI)
			}
			wantTileI++
		}
	}
}

func TestBuildRows_IncompleteRowCapsTileAreaInsteadOfStretching(t *testing.T) {
	// Single square tile, tilePct=0.3 on a 1000x1000 screen. It never reaches
	// the area threshold on its own (avgArea would be 1,000,000 if stretched
	// to full width), so it closes only because media ran out — this is the
	// "incomplete row" case that must be capped rather than stretched.
	threshold := 0.3 * 1000 * 1000 // 300,000
	media := []model.Media{square("solo")}
	rows := BuildRows(media, 1000, 1000, 0.3)

	if len(rows) != 1 || len(rows[0].Tiles) != 1 {
		t.Fatalf("got %+v, want a single row with a single tile", rows)
	}
	tile := rows[0].Tiles[0]
	area := float64(tile.W) * float64(rows[0].H)
	if area > threshold*1.01 { // pixel-rounding slack
		t.Fatalf("tile area %v exceeds threshold %v", area, threshold)
	}
	// width should come from height*aspectRatio (both ~548), not stretch to
	// fill the full 1000px screen width like a complete row would.
	if tile.W >= 1000 {
		t.Fatalf("got width %d, want it capped well under screenW=1000", tile.W)
	}
}

func TestBuildRows_CompleteRowStillStretchesToFillWidth(t *testing.T) {
	// 2 square tiles that close via the area threshold (case a, "complete")
	// should retain the original full-width-stretch behavior.
	media := []model.Media{square("a"), square("b"), square("c")}
	rows := BuildRows(media, 1000, 1000, 0.3)

	row0 := rows[0]
	if len(row0.Tiles) != 2 {
		t.Fatalf("row0 got %d tiles, want 2", len(row0.Tiles))
	}
	if row0.Tiles[0].W != 500 || row0.Tiles[1].W != 499 {
		t.Fatalf("row0 widths = %d,%d; want 500,499 (full-width stretch for a complete row)",
			row0.Tiles[0].W, row0.Tiles[1].W)
	}
}

func TestBuildRows_ZeroTilePctSkipsCappingEntirely(t *testing.T) {
	// tilePct=0 means there's no area cap to respect (threshold<=0), so the
	// old full-width-stretch behavior is kept even for an incomplete row —
	// this preserves the existing spec-example test's expectations.
	media := []model.Media{square("a"), square("b")}
	rows := BuildRows(media, 1000, 1000, 0)

	if len(rows) != 1 || len(rows[0].Tiles) != 2 {
		t.Fatalf("got %+v, want a single row with 2 tiles", rows)
	}
	if rows[0].Tiles[0].W != 500 || rows[0].Tiles[1].W != 499 {
		t.Fatalf("got widths %d,%d want 500,499", rows[0].Tiles[0].W, rows[0].Tiles[1].W)
	}
}

func TestBuildRows_TileAndPreviewMirrorOriginalMedia(t *testing.T) {
	m := model.Media{Path: "clip.mp4", Width: 1920, Height: 1080, Filesize: 12345, Mdate: 999, Duration: 7, IsVid: true}
	rows := BuildRows([]model.Media{m}, 1000, 1000, 1.0)

	tile := rows[0].Tiles[0]
	if tile.Path != m.Path || tile.IsVid != m.IsVid || tile.Duration != m.Duration ||
		tile.Filesize != m.Filesize || tile.Mdate != m.Mdate {
		t.Fatalf("tile %+v does not mirror media %+v", tile, m)
	}
	preview := tile.Preview
	if preview.W != m.Width || preview.H != m.Height {
		t.Fatalf("preview %+v does not mirror media dimensions %+v", preview, m)
	}
	// HasThumbnail/HasHighlight are only populated later, per-request, by
	// handleShuffle — BuildRows itself never stats the filesystem.
	if preview.HasThumbnail || preview.HasHighlight {
		t.Fatalf("preview %+v should not have thumbnail/highlight flags set yet", preview)
	}
}
