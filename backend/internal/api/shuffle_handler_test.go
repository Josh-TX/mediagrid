package api

import (
	"testing"

	"mediagrid/internal/shuffle"
)

// makeRows builds rows with rowSizes[i] tiles each, TileI assigned
// sequentially across the whole set (mirroring the server's real layout
// output, where tilei is a global running index).
func makeRows(rowSizes ...int) []shuffle.Row {
	rows := make([]shuffle.Row, len(rowSizes))
	tileI := 0
	for i, size := range rowSizes {
		tiles := make([]shuffle.Tile, size)
		for j := 0; j < size; j++ {
			tiles[j] = shuffle.Tile{TileI: tileI}
			tileI++
		}
		rows[i] = shuffle.Row{RowI: i, Tiles: tiles}
	}
	return rows
}

func TestResolveRowRange(t *testing.T) {
	intp := func(n int) *int { return &n }

	cases := []struct {
		name                string
		skipR, takeR, takeI *int
		rows                []shuffle.Row
		wantLo, wantHi      int
	}{
		{"defaults to full range", nil, nil, nil, makeRows(1, 1, 1, 1, 1, 1, 1, 1, 1, 1), 0, 10},
		{"explicit skipr/taker", intp(2), intp(3), nil, makeRows(1, 1, 1, 1, 1, 1, 1, 1, 1, 1), 2, 5},
		{"taker=20 on a 10-row list returns all 10 (clamped)", intp(0), intp(20), nil, makeRows(1, 1, 1, 1, 1, 1, 1, 1, 1, 1), 0, 10},
		{"skipr clamped to zero", intp(-5), nil, nil, makeRows(1, 1, 1, 1, 1, 1, 1, 1, 1, 1), 0, 10},
		{"empty result set", nil, nil, nil, makeRows(), 0, 0},
		{
			name:  "takei within the first taker rows changes nothing",
			skipR: intp(0), takeR: intp(3), takeI: intp(1), // tile 1 is in row 0 (3 tiles/row)
			rows:   makeRows(3, 3, 3, 3, 3),
			wantLo: 0, wantHi: 3,
		},
		{
			name:  "takei beyond taker rows extends the range to cover it",
			skipR: intp(0), takeR: intp(2), takeI: intp(10), // 3 tiles/row -> tile 10 is row 3
			rows:   makeRows(3, 3, 3, 3, 3),
			wantLo: 0, wantHi: 4,
		},
		{
			name:  "takei beyond the last tile clamps to all available rows",
			skipR: intp(0), takeR: intp(1), takeI: intp(9999),
			rows:   makeRows(3, 3, 3),
			wantLo: 0, wantHi: 3,
		},
		{
			name:  "takei combined with a non-zero skipr",
			skipR: intp(1), takeR: intp(1), takeI: intp(10), // row 3 contains tile 10
			rows:   makeRows(3, 3, 3, 3, 3),
			wantLo: 1, wantHi: 4,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			lo, hi := resolveRowRange(c.skipR, c.takeR, c.takeI, c.rows)
			if lo != c.wantLo || hi != c.wantHi {
				t.Fatalf("got (%d, %d), want (%d, %d)", lo, hi, c.wantLo, c.wantHi)
			}
		})
	}
}

func TestRowIndexContaining(t *testing.T) {
	rows := makeRows(3, 3, 3) // tiles 0-2 -> row 0, 3-5 -> row 1, 6-8 -> row 2

	cases := []struct {
		name  string
		tileI int
		want  int
	}{
		{"first tile of first row", 0, 0},
		{"last tile of first row", 2, 0},
		{"first tile of second row", 3, 1},
		{"last row", 8, 2},
		{"beyond the last tile clamps to the last row", 100, 2},
		{"negative index is not found", -1, -1},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := rowIndexContaining(rows, c.tileI)
			if got != c.want {
				t.Fatalf("got %d, want %d", got, c.want)
			}
		})
	}

	if got := rowIndexContaining(nil, 0); got != -1 {
		t.Fatalf("empty rows: got %d, want -1", got)
	}
}
