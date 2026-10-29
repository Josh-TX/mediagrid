package preview

import "math"

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

// CalcSpriteRows returns the number of sprite rows for a video: the line
// through (minDurTwoRows, 2) and (minDurMaxRows, maxRows) evaluated at the
// duration, rounded to the nearest int and clamped to [1, maxRows]. ok is
// false when the duration is unknown (<= 0).
func CalcSpriteRows(videoDuration float64, maxRows int, minDurTwoRows, minDurMaxRows float64) (rows int, ok bool) {
	if videoDuration <= 0 || maxRows < 1 {
		return 0, false
	}
	if maxRows <= 2 || minDurMaxRows <= minDurTwoRows {
		// No usable slope: step from 1 row to maxRows (capped at 2) at minDurTwoRows.
		rows = 1
		if videoDuration >= minDurTwoRows {
			rows = min(2, maxRows)
		}
		return rows, true
	}
	slope := float64(maxRows-2) / (minDurMaxRows - minDurTwoRows)
	rows = int(math.Round(2 + (videoDuration-minDurTwoRows)*slope))
	if rows < 1 {
		rows = 1
	}
	if rows > maxRows {
		rows = maxRows
	}
	return rows, true
}

// SpriteFrameTime returns the timestamp of frame i out of n: the video is
// split into n+1 equal sections and frames sit on the n boundaries between
// them (so none at t=0 or the very end).
func SpriteFrameTime(mediaDuration float64, n, i int) float64 {
	return mediaDuration * float64(i+1) / float64(n+1)
}
