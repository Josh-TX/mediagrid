package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"mediagrid/internal/shuffle"
)

func (s *Server) handleShuffle(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	tilePct, err1 := strconv.ParseFloat(q.Get("tilePct"), 64)
	screenW, err2 := strconv.Atoi(q.Get("screenW"))
	screenH, err3 := strconv.Atoi(q.Get("screenH"))
	if err1 != nil || err2 != nil || err3 != nil {
		http.Error(w, "tilePct, screenW, and screenH are required numeric query params", http.StatusBadRequest)
		return
	}

	params := shuffle.Params{
		TilePct:   tilePct,
		ScreenW:   screenW,
		ScreenH:   screenH,
		F:         q.Get("f"),
		Sort:      q.Get("sort"),
		Dir:       q.Get("dir"),
		ExVids:    q.Get("exVids") == "1",
		ExImgs:    q.Get("exImgs") == "1",
		ExPort:    q.Get("exPort") == "1",
		ExLand:    q.Get("exLand") == "1",
		MinDur:    atoiOr0(q.Get("minDur")),
		MaxDur:    atoiOr0(q.Get("maxDur")),
		BasePath:  q.Get("basepath"),
		Reshuffle: q.Get("reshuffle") == "1",
	}
	if params.Sort == "" {
		params.Sort = "rand"
	}
	if params.Dir == "" {
		params.Dir = shuffle.DefaultDir(params.Sort)
	}
	if csv := q.Get("whitelist"); csv != "" {
		params.Whitelist = splitCSV(csv)
	}
	if csv := q.Get("blacklist"); csv != "" {
		params.Blacklist = splitCSV(csv)
	}
	if v := q.Get("skipr"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			params.SkipR = &n
		}
	}
	if v := q.Get("taker"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			params.TakeR = &n
		}
	}
	if v := q.Get("takei"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			params.TakeI = &n
		}
	}

	var rows []shuffle.Row
	var totalTiles int

	if params.Sort == "rand" {
		key := shuffle.CacheKey(params)
		if params.Reshuffle {
			s.randCache.Delete(key)
		}
		cachedRows, cachedTotal, ok := s.randCache.Get(key)
		if ok {
			rows, totalTiles = cachedRows, cachedTotal
		} else {
			media, err := s.store.ListAllMedia()
			if err != nil {
				http.Error(w, "failed to load media", http.StatusInternalServerError)
				return
			}
			filtered := shuffle.Filter(media, params)
			rows = shuffle.BuildRandomRows(filtered, params.ScreenW, params.ScreenH, params.TilePct)
			totalTiles = len(filtered)
			s.randCache.Set(key, rows, totalTiles)
		}
	} else {
		media, err := s.store.ListAllMedia()
		if err != nil {
			http.Error(w, "failed to load media", http.StatusInternalServerError)
			return
		}
		filtered := shuffle.Filter(media, params)
		sorted := shuffle.Sort(filtered, params.Sort, params.Dir)
		rows = shuffle.BuildRows(sorted, params.ScreenW, params.ScreenH, params.TilePct)
		totalTiles = len(sorted)
	}

	totalRows := len(rows)
	skipR, takeR := resolveRowRange(params.SkipR, params.TakeR, params.TakeI, rows)

	result := shuffle.Result{
		TotalRows:  totalRows,
		TotalTiles: totalTiles,
		Rows:       []shuffle.Row{},
	}
	if skipR < takeR {
		result.Rows = rows[skipR:takeR]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// resolveRowRange clamps the optional skipr/taker query params to a valid
// half-open [0, totalRows) range, defaulting to the full range when absent.
// skipr is how many rows to skip; taker is how many rows to take (a count,
// not an end index) — e.g. skipr=0&taker=20 returns (up to) 20 rows.
//
// If takei is present, the returned range is extended (never shrunk) so it
// also covers the row containing that tile index — i.e. the caller gets at
// least taker rows, or more if needed to reach takei. A takei beyond the
// last tile is clamped to just mean "through the last row" rather than
// erroring.
func resolveRowRange(skipR, takeR, takeI *int, rows []shuffle.Row) (int, int) {
	totalRows := len(rows)

	lo := 0
	if skipR != nil {
		lo = *skipR
	}
	if lo < 0 {
		lo = 0
	}
	if lo > totalRows {
		lo = totalRows
	}

	hi := totalRows
	if takeR != nil {
		hi = lo + *takeR
	}
	if takeI != nil {
		if rowIdx := rowIndexContaining(rows, *takeI); rowIdx >= 0 && rowIdx+1 > hi {
			hi = rowIdx + 1
		}
	}
	if hi > totalRows {
		hi = totalRows
	}
	if hi < lo {
		hi = lo
	}
	return lo, hi
}

// rowIndexContaining returns the index of the row whose tiles span tileI, or
// the last row's index if tileI is beyond the last tile (clamping rather
// than erroring, per resolveRowRange's takei contract). Returns -1 only when
// rows is empty or tileI is negative.
func rowIndexContaining(rows []shuffle.Row, tileI int) int {
	if len(rows) == 0 || tileI < 0 {
		return -1
	}
	for _, row := range rows {
		if len(row.Tiles) == 0 {
			continue
		}
		last := row.Tiles[len(row.Tiles)-1].TileI
		if tileI <= last {
			return row.RowI
		}
	}
	return len(rows) - 1
}

func atoiOr0(s string) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return n
}

func splitCSV(csv string) []string {
	parts := strings.Split(csv, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
