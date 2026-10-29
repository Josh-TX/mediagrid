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
		twoRows  float64
		maxDur   float64
		wantRows int
		wantOK   bool
	}{
		{10, 6, 120, 360, 1, true},   // extrapolates below 1: clamped to 1
		{120, 6, 120, 360, 2, true},  // exactly the 2-row point
		{180, 6, 120, 360, 3, true},  // 2 + 60*(4/240) = 3
		{200, 6, 120, 360, 3, true},  // 3.33 rounds to 3
		{230, 6, 120, 360, 4, true},  // 3.83 rounds to 4
		{360, 6, 120, 360, 6, true},  // exactly the max-row point
		{9999, 6, 120, 360, 6, true}, // capped at maxRows
		{500, 2, 120, 360, 2, true},  // maxRows 2: step
		{50, 2, 120, 360, 1, true},
		{0, 6, 120, 360, 0, false}, // unknown duration
	}
	for _, c := range cases {
		rows, ok := CalcSpriteRows(c.dur, c.maxRows, c.twoRows, c.maxDur)
		if rows != c.wantRows || ok != c.wantOK {
			t.Errorf("CalcSpriteRows(%v,%d,%v,%v) = %d,%v; want %d,%v", c.dur, c.maxRows, c.twoRows, c.maxDur, rows, ok, c.wantRows, c.wantOK)
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
