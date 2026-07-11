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
	if v := q.Get("minr"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			params.MinR = &n
		}
	}
	if v := q.Get("maxr"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			params.MaxR = &n
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
	minR, maxR := resolveRowRange(params.MinR, params.MaxR, totalRows)

	result := shuffle.Result{
		TotalRows:  totalRows,
		TotalTiles: totalTiles,
		Rows:       []shuffle.Row{},
	}
	if minR < maxR {
		result.Rows = rows[minR:maxR]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// resolveRowRange clamps the optional minr/maxr query params to a valid
// half-open [0, totalRows] range, defaulting to the full range when absent.
// maxr is exclusive (e.g. minr=0&maxr=20 returns 20 rows), matching the
// spec's "calls /api/shuffle with maxr=20" for an initial 20-row page.
func resolveRowRange(minR, maxR *int, totalRows int) (int, int) {
	lo := 0
	if minR != nil {
		lo = *minR
	}
	hi := totalRows
	if maxR != nil {
		hi = *maxR
	}
	if lo < 0 {
		lo = 0
	}
	if hi > totalRows {
		hi = totalRows
	}
	return lo, hi
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
