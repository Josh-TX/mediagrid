package preview

import "testing"

func TestTargetDimensions_MatchesSpecExample(t *testing.T) {
	// Spec example: 360000 target pixels on a 1:4 (portrait) source should
	// land at exactly 300x1200.
	w, h := TargetDimensions(1, 4, 360000)
	if w != 300 || h != 1200 {
		t.Fatalf("got %dx%d, want 300x1200", w, h)
	}
}

func TestTargetDimensions_PreservesAspectRatioAndIsEven(t *testing.T) {
	w, h := TargetDimensions(4000, 1000, 360000)
	if w%2 != 0 || h%2 != 0 {
		t.Fatalf("expected even dimensions, got %dx%d", w, h)
	}
	gotRatio := float64(w) / float64(h)
	if diff := gotRatio - 4.0; diff > 0.05 || diff < -0.05 {
		t.Fatalf("got ratio %.3f, want ~4.0 (dims %dx%d)", gotRatio, w, h)
	}
	if gotPixels := w * h; gotPixels < 355000 || gotPixels > 365000 {
		t.Fatalf("got %d pixels, want close to 360000 (dims %dx%d)", gotPixels, w, h)
	}
}

func TestTargetDimensions_ZeroInputsReturnZero(t *testing.T) {
	if w, h := TargetDimensions(0, 100, 1000); w != 0 || h != 0 {
		t.Fatalf("got %dx%d, want 0x0", w, h)
	}
}
