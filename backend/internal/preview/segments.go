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

// HighlightSegmentStart returns the start time (seconds) of segment i out of
// n evenly-spaced buckets spanning [0, mediaDuration]: the segment is
// centered on bucket i's midpoint, then clamped to
// [0, mediaDuration-segmentDuration] so it never runs past the start/end of
// the video (which could otherwise happen if segmentDuration exceeds the
// bucket width, e.g. from a misconfigured maxProportion < 1).
func HighlightSegmentStart(mediaDuration float64, n, i int, segmentDuration float64) float64 {
	bucketWidth := mediaDuration / float64(n)
	bucketMid := float64(i)*bucketWidth + bucketWidth/2
	start := bucketMid - segmentDuration/2

	maxStart := mediaDuration - segmentDuration
	if maxStart < 0 {
		maxStart = 0
	}
	if start < 0 {
		start = 0
	}
	if start > maxStart {
		start = maxStart
	}
	return start
}
