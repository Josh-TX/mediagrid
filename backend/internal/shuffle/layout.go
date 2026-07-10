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
// list (minr/maxr are applied afterward, only to slice the resulting rows).
func BuildRows(media []model.Media, screenW, screenH int, tilePct float64) []Row {
	threshold := tilePct * float64(screenW) * float64(screenH)

	var rows []Row
	tileI := 0
	idx := 0
	n := len(media)

	for idx < n {
		row := []model.Media{media[idx]}
		idx++

		var widths []int
		var rowHeight float64
		for {
			widths, rowHeight = rowMetrics(row, screenW)
			avgArea := rowHeight * float64(screenW) / float64(len(row))
			if avgArea <= threshold || len(row) >= maxTilesPerRow || idx >= n {
				break
			}
			row = append(row, media[idx])
			idx++
		}

		tiles := make([]Tile, len(row))
		for i, m := range row {
			tiles[i] = Tile{
				TileI: tileI,
				W:     widths[i],
				Path:  m.Path,
				IsVid: m.IsVid,
				Preview: PreviewData{
					Path:     m.Path,
					W:        m.Width,
					H:        m.Height,
					Filesize: m.Filesize,
					Mdate:    m.Mdate,
					Duration: m.Duration,
					IsVid:    m.IsVid,
				},
			}
			tileI++
		}
		rows = append(rows, Row{
			RowI:  len(rows),
			H:     int(math.Round(rowHeight)),
			Tiles: tiles,
		})
	}

	return rows
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
