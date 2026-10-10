package library

import (
	"testing"

	"mediagrid/internal/model"
)

func mk(wl, bl string) Filter {
	return New(model.LibrarySettings{WhitelistCSV: wl, BlacklistCSV: bl})
}

func TestInLibrary(t *testing.T) {
	cases := []struct {
		name, wl, bl, path string
		want               bool
	}{
		{"empty admits all", "", "", "a/b.jpg", true},
		{"whitelist match", "a/", "", "a/b.jpg", true},
		{"whitelist miss", "a/", "", "b/b.jpg", false},
		{"plain startswith", "a", "", "ab/x.jpg", true},
		{"slash excludes sibling", "a/", "", "ab/x.jpg", false},
		{"blacklist wins", "a/", "a/x", "a/xy.jpg", false},
		{"blacklist only", "", "tmp/", "tmp/a.jpg", false},
		{"blacklist only other", "", "tmp/", "a/tmp/a.jpg", true},
		{"case insensitive", "Photos/", "", "photos/a.jpg", true},
		{"csv with spaces", "a/ , b/", "", "b/c.jpg", true},
		{"leading slash entry", "/a/", "", "a/c.jpg", true},
	}
	for _, c := range cases {
		if got := mk(c.wl, c.bl).InLibrary(c.path); got != c.want {
			t.Errorf("%s: InLibrary(%q) = %v, want %v", c.name, c.path, got, c.want)
		}
	}
}

func TestDescendDir(t *testing.T) {
	cases := []struct {
		name, wl, bl, dir string
		want              bool
	}{
		{"empty admits all", "", "", "a", true},
		{"inside whitelist", "a/", "", "a/sub", true},
		{"ancestor of whitelist", "a/b/", "", "a", true},
		{"unrelated to whitelist", "a/", "", "b", false},
		{"partial name whitelist", "2024-", "", "2024-01", true},
		{"partial name miss", "2024-", "", "2023-01", false},
		{"blacklisted subtree", "", "tmp/", "tmp", false},
		{"blacklisted nested", "", "a/tmp", "a/tmp/x", false},
		{"blacklist deeper than dir", "", "a/b/c.jpg", "a/b", true},
	}
	for _, c := range cases {
		if got := mk(c.wl, c.bl).DescendDir(c.dir); got != c.want {
			t.Errorf("%s: DescendDir(%q) = %v, want %v", c.name, c.dir, got, c.want)
		}
	}
}

func TestContains(t *testing.T) {
	f := New(model.LibrarySettings{WhitelistCSV: "a/", WhitelistContainsCSV: "vacation", BlacklistContainsCSV: "trailer"})
	cases := []struct {
		path string
		want bool
	}{
		{"a/x.jpg", true},
		{"b/my vacation/x.jpg", true},
		{"b/x.jpg", false},
		{"a/trailer/x.jpg", false},
		{"b/vacation-trailer.mp4", false},
	}
	for _, c := range cases {
		if got := f.InLibrary(c.path); got != c.want {
			t.Errorf("InLibrary(%q) = %v, want %v", c.path, got, c.want)
		}
	}
	if !f.DescendDir("b") {
		t.Error("contains whitelist must not prune dirs")
	}
	if f.DescendDir("a/trailer") {
		t.Error("contains blacklist should prune matching dir")
	}
	if New(model.LibrarySettings{WhitelistContainsCSV: "x"}).DescendDir("anything") != true {
		t.Error("contains-only whitelist must descend")
	}
}
