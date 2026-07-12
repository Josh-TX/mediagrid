package shuffle

import (
	"math"

	"mediagrid/internal/model"
)

const maxTilesPerRow = 12

// BuildRows greedily packs media into rows: starting from the next
// unassigned item, tiles are added one at a time until the row's average
// tile area drops to/under tilePct*screenW*screenH, or the row hits
// maxTilesPerRow, or media runs out. rowi/tilei are absolute indices into
// the full media slice, so callers must pass the complete filtered/sorted
// list (skipr/taker are applied afterward, only to slice the resulting rows).
//
// A trailing row that closes only because media ran out (not because it hit
// the area threshold or maxTilesPerRow) is "incomplete": rather than
// stretching its tiles to fill screenW, which would make them exceed
// tilePct, its tiles are sized off a target area instead, leaving the row
// narrower than screenW.
func BuildRows(media []model.Media, screenW, screenH int, tilePct float64) []Row {
	threshold := tilePct * float64(screenW) * float64(screenH)

	var rows []Row
	tileI := 0
	idx := 0
	n := len(media)

	for idx < n {
		row, widths, rowHeight, nextIdx, complete := packOneRow(media, idx, screenW, threshold)
		idx = nextIdx
		if !complete && threshold > 0 {
			widths, rowHeight = cappedRowMetrics(row, threshold)
		}
		rows = append(rows, buildRow(len(rows), &tileI, row, widths, rowHeight))
	}

	return rows
}

// packOneRow builds a single row starting at media[idx] using the same
// greedy growth BuildRows has always used, returning the row's media,
// pixel widths, and height alongside the next unassigned index. complete
// reports whether the row closed because it hit the area threshold or
// maxTilesPerRow (a "full" row) as opposed to simply running out of media.
func packOneRow(media []model.Media, idx int, screenW int, threshold float64) (row []model.Media, widths []int, rowHeight float64, nextIdx int, complete bool) {
	n := len(media)
	row = []model.Media{media[idx]}
	idx++

	for {
		widths, rowHeight = rowMetrics(row, screenW)
		avgArea := rowHeight * float64(screenW) / float64(len(row))
		if avgArea <= threshold || len(row) >= maxTilesPerRow {
			return row, widths, rowHeight, idx, true
		}
		if idx >= n {
			return row, widths, rowHeight, idx, false
		}
		row = append(row, media[idx])
		idx++
	}
}

// buildRow converts a packed row (media + pixel widths + height) into a Row,
// assigning rowI and drawing sequential tile indices from *tileI.
func buildRow(rowI int, tileI *int, row []model.Media, widths []int, rowHeight float64) Row {
	tiles := make([]Tile, len(row))
	for i, m := range row {
		tiles[i] = Tile{
			TileI:    *tileI,
			W:        widths[i],
			Path:     m.Path,
			IsVid:    m.IsVid,
			Duration: m.Duration,
			Filesize: m.Filesize,
			Mdate:    m.Mdate,
			Preview: PreviewData{
				W: m.Width,
				H: m.Height,
			},
		}
		*tileI++
	}
	return Row{
		RowI:  rowI,
		H:     int(math.Round(rowHeight)),
		Tiles: tiles,
	}
}

// cappedRowMetrics sizes an incomplete row's tiles off a target area instead
// of splitting the full screen width: it picks the row height that makes
// the row's average tile area equal threshold, then derives each tile's
// width from that height and its own aspect ratio. The resulting widths
// generally sum to less than screenW.
func cappedRowMetrics(row []model.Media, threshold float64) (widths []int, rowHeight float64) {
	avgAspect := 0.0
	for _, m := range row {
		avgAspect += m.AspectRatio()
	}
	avgAspect /= float64(len(row))

	rowHeight = math.Sqrt(threshold / avgAspect)
	widths = make([]int, len(row))
	for i, m := range row {
		widths[i] = int(math.Round(rowHeight * m.AspectRatio()))
	}
	return widths, rowHeight
}

// rowMetrics computes each tile's pixel width (splitting screenW minus
// inter-tile gaps as evenly as possible) and the row's resulting height (the
// average of each tile's width/aspectRatio).
func rowMetrics(row []model.Media, screenW int) (widths []int, rowHeight float64) {
	n := len(row)
	availableWidth := screenW - (n - 1)
	base := availableWidth / n
	remainder := availableWidth % n

	widths = make([]int, n)
	sumHeight := 0.0
	for i, m := range row {
		w := base
		if i < remainder {
			w++
		}
		widths[i] = w
		sumHeight += float64(w) / m.AspectRatio()
	}
	rowHeight = sumHeight / float64(n)
	return widths, rowHeight
}
