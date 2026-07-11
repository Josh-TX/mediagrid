package preview

// CalcHighlightSegments returns the number of segments (capped at
// segmentCount, minimum 1) a video of the given duration supports, per the
// max-proportion rule: N segments require
// videoDuration >= N * segmentDuration * maxProportion. ok is false when the
// video doesn't meet the threshold even for a single segment, meaning it
// should be skipped entirely.
func CalcHighlightSegments(videoDuration float64, segmentCount int, segmentDuration, maxProportion float64) (n int, ok bool) {
	for n := segmentCount; n >= 1; n-- {
		minDur := float64(n) * segmentDuration * maxProportion
		if videoDuration >= minDur {
			return n, true
		}
	}
	return 0, false
}
