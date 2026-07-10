package shuffle

import (
	"math/rand"
	"sort"
	"strings"

	"mediagrid/internal/model"
)

// DefaultDir returns the implicit sort direction for a given sort type when
// the caller didn't supply one explicitly.
func DefaultDir(sortType string) string {
	switch sortType {
	case "size", "date":
		return "desc"
	default: // "az"
		return "asc"
	}
}

// Sort returns a new, sorted slice; it never mutates media. sortType must be
// "size", "az", or "date" — "rand" is handled separately via RandOrder.
func Sort(media []model.Media, sortType, dir string) []model.Media {
	result := make([]model.Media, len(media))
	copy(result, media)

	asc := dir == "asc"

	var less func(a, b model.Media) bool
	switch sortType {
	case "size":
		less = func(a, b model.Media) bool { return a.Filesize < b.Filesize }
	case "az":
		less = func(a, b model.Media) bool { return strings.ToLower(a.Path) < strings.ToLower(b.Path) }
	case "date":
		less = func(a, b model.Media) bool { return a.Mdate < b.Mdate }
	default:
		return result
	}

	sort.SliceStable(result, func(i, j int) bool {
		if asc {
			return less(result[i], result[j])
		}
		return less(result[j], result[i])
	})
	return result
}

// RandOrder returns a new slice in a fresh random permutation of media.
func RandOrder(media []model.Media) []model.Media {
	result := make([]model.Media, len(media))
	copy(result, media)
	rand.Shuffle(len(result), func(i, j int) {
		result[i], result[j] = result[j], result[i]
	})
	return result
}
