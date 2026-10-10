// Package library decides which media paths belong to the library, based on
// the global whitelist/blacklist (StartsWith and Contains). Unlike preset
// filters (which only affect shuffles), this gates what Scan walks and what
// Clean keeps.
package library

import (
	"strings"

	"mediagrid/internal/model"
)

// Filter holds normalized (lowercase, forward-slash, no leading "/")
// entries. The zero value admits everything.
type Filter struct {
	wlStarts, wlContains []string
	blStarts, blContains []string
}

func New(s model.LibrarySettings) Filter {
	return Filter{
		wlStarts:   parseCSV(s.WhitelistCSV),
		wlContains: parseCSV(s.WhitelistContainsCSV),
		blStarts:   parseCSV(s.BlacklistCSV),
		blContains: parseCSV(s.BlacklistContainsCSV),
	}
}

func parseCSV(csv string) []string {
	var out []string
	for _, part := range strings.Split(csv, ",") {
		p := strings.ToLower(strings.TrimSpace(part))
		p = strings.ReplaceAll(p, "\\", "/")
		p = strings.TrimLeft(p, "/")
		p = strings.TrimPrefix(p, "./")
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func normalize(p string) string {
	return strings.ToLower(strings.ReplaceAll(p, "\\", "/"))
}

// InLibrary reports whether relPath (relative to the media root) is in the
// library: it matches no blacklist entry, and, if any whitelist entry is
// set, matches at least one (StartsWith or Contains).
func (f Filter) InLibrary(relPath string) bool {
	p := normalize(relPath)
	if f.blacklisted(p) {
		return false
	}
	if len(f.wlStarts) == 0 && len(f.wlContains) == 0 {
		return true
	}
	return hasAnyPrefix(p, f.wlStarts) || hasAnyContains(p, f.wlContains)
}

// DescendDir reports whether Scan should walk into the directory relDir.
// It's false if the whole subtree is blacklisted, or if no whitelist entry
// could match anything inside it. A Contains whitelist entry could match
// at any depth, so it never prunes.
func (f Filter) DescendDir(relDir string) bool {
	p := normalize(relDir) + "/"
	if f.blacklisted(p) {
		return false
	}
	if len(f.wlStarts) == 0 && len(f.wlContains) == 0 {
		return true
	}
	if len(f.wlContains) > 0 {
		return true
	}
	for _, w := range f.wlStarts {
		if strings.HasPrefix(p, w) || strings.HasPrefix(w, p) {
			return true
		}
	}
	return false
}

func (f Filter) blacklisted(p string) bool {
	return hasAnyPrefix(p, f.blStarts) || hasAnyContains(p, f.blContains)
}

func hasAnyPrefix(p string, prefixes []string) bool {
	for _, e := range prefixes {
		if strings.HasPrefix(p, e) {
			return true
		}
	}
	return false
}

func hasAnyContains(p string, terms []string) bool {
	for _, e := range terms {
		if strings.Contains(p, e) {
			return true
		}
	}
	return false
}
