package preview

import "math"

// TargetDimensions returns the width/height closest to preserving srcW:srcH's
// aspect ratio while multiplying to approximately targetPixels. Each
// dimension is rounded to the nearest even integer (minimum 2) — required
// for libx264/yuv420p video encoding, and applied uniformly to webp output
// too for consistency.
func TargetDimensions(srcW, srcH, targetPixels int) (w, h int) {
	if srcW <= 0 || srcH <= 0 || targetPixels <= 0 {
		return 0, 0
	}
	ratio := float64(srcW) / float64(srcH)
	fh := math.Sqrt(float64(targetPixels) / ratio)
	fw := fh * ratio
	return roundToEven(fw), roundToEven(fh)
}

func roundToEven(v float64) int {
	n := int(math.Round(v))
	if n%2 != 0 {
		n++
	}
	if n < 2 {
		n = 2
	}
	return n
}
