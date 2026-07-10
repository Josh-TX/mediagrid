package shuffle

import (
	"strings"

	"mediagrid/internal/model"
)

// Filter applies the SimpleFilter (Params.F) AND the PresetFilter (everything
// else) to media. Whitelist/blacklist terms OR within their own list; every
// other gate ANDs together.
func Filter(media []model.Media, p Params) []model.Media {
	terms := strings.Fields(p.F)

	result := make([]model.Media, 0, len(media))
	for _, m := range media {
		if matches(m, p, terms) {
			result = append(result, m)
		}
	}
	return result
}

func matches(m model.Media, p Params, simpleTerms []string) bool {
	lowerPath := strings.ToLower(m.Path)

	for _, term := range simpleTerms {
		if !strings.Contains(lowerPath, strings.ToLower(term)) {
			return false
		}
	}

	if p.ExVids && m.IsVid {
		return false
	}
	if p.ExImgs && !m.IsVid {
		return false
	}

	aspect := m.AspectRatio()
	if p.ExPort && aspect <= 1 {
		return false
	}
	if p.ExLand && aspect >= 1 {
		return false
	}

	if m.IsVid {
		if p.MinDur > 0 && m.Duration < p.MinDur {
			return false
		}
		if p.MaxDur > 0 && m.Duration > p.MaxDur {
			return false
		}
	}

	if len(p.Whitelist) > 0 && !anyContains(lowerPath, p.Whitelist) {
		return false
	}
	if len(p.Blacklist) > 0 && anyContains(lowerPath, p.Blacklist) {
		return false
	}

	if p.BasePath != "" && !strings.HasPrefix(lowerPath, strings.ToLower(p.BasePath)) {
		return false
	}

	return true
}

func anyContains(lowerPath string, terms []string) bool {
	for _, term := range terms {
		if strings.Contains(lowerPath, strings.ToLower(term)) {
			return true
		}
	}
	return false
}
