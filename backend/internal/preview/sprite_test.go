package preview

import (
	"math"
	"os"
	"path/filepath"
	"testing"
)

func TestCalcSpriteRows(t *testing.T) {
	cases := []struct {
		dur      float64
		maxRows  int
		minSecs  float64
		wantRows int
		wantOK   bool
	}{
		{10, 6, 60, 1, true},   // shorter than one row: clamped to 1
		{130, 6, 60, 2, true},  // floor(130/60)
		{9999, 6, 60, 6, true}, // capped at maxRows
		{0, 6, 60, 0, false},   // unknown duration
	}
	for _, c := range cases {
		rows, ok := CalcSpriteRows(c.dur, c.maxRows, c.minSecs)
		if rows != c.wantRows || ok != c.wantOK {
			t.Errorf("CalcSpriteRows(%v,%d,%v) = %d,%v; want %d,%v", c.dur, c.maxRows, c.minSecs, rows, ok, c.wantRows, c.wantOK)
		}
	}
}

func TestSpriteFrameTime_BoundariesOfNPlus1Sections(t *testing.T) {
	// 3 frames over 100s: sections of 25s, frames at 25/50/75.
	for i, want := range []float64{25, 50, 75} {
		if got := SpriteFrameTime(100, 3, i); math.Abs(got-want) > 1e-9 {
			t.Errorf("frame %d = %v, want %v", i, got, want)
		}
	}
}

func TestSpriteIndex_FindAndRemove(t *testing.T) {
	root := t.TempDir()
	p := SpritePath(root, "sub/clip.mp4", 5, 8)
	if filepath.Base(p) != "clip.mp4__ssr05c08.webp" {
		t.Fatalf("unexpected sprite name %s", p)
	}
	os.MkdirAll(filepath.Dir(p), 0o755)
	os.WriteFile(p, []byte("x"), 0o644)
	// A different media file whose name merely starts the same must not match.
	os.WriteFile(SpritePath(root, "sub/clip.mp4.bak", 1, 1), []byte("x"), 0o644)

	got, rows, cols, ok := FindSprite(root, "sub/clip.mp4")
	if !ok || got != p || rows != 5 || cols != 8 {
		t.Fatalf("FindSprite = %q,%d,%d,%v", got, rows, cols, ok)
	}
	if _, _, _, ok := FindSprite(root, "sub/none.mp4"); ok {
		t.Fatal("found sprite for media without one")
	}

	RemoveSprites(root, "sub/clip.mp4", "")
	if _, _, _, ok := FindSprite(root, "sub/clip.mp4"); ok {
		t.Fatal("sprite still present after RemoveSprites")
	}
	if _, _, _, ok := FindSprite(root, "sub/clip.mp4.bak"); !ok {
		t.Fatal("RemoveSprites removed an unrelated media file's sprite")
	}
}
