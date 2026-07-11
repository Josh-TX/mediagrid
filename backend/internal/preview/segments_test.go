package preview

import (
	"math"
	"testing"
)

func TestCalcHighlightSegments(t *testing.T) {
	cases := []struct {
		name                                     string
		duration, segmentDuration, maxProportion float64
		segmentCount                             int
		wantN                                    int
		wantOK                                   bool
	}{
		{"long enough for the full segment count", 100, 2, 3, 5, 5, true},
		{"long enough for some but not all segments", 20, 2, 3, 5, 3, true},
		{"too short even for one segment", 5, 2, 3, 5, 0, false},
		{"exactly meets the threshold for one segment", 6, 2, 3, 5, 1, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			n, ok := CalcHighlightSegments(c.duration, c.segmentCount, c.segmentDuration, c.maxProportion)
			if ok != c.wantOK {
				t.Fatalf("got ok=%v, want %v", ok, c.wantOK)
			}
			if ok && n != c.wantN {
				t.Fatalf("got n=%d, want %d", n, c.wantN)
			}
		})
	}
}

func TestHighlightSegmentStart(t *testing.T) {
	cases := []struct {
		name                           string
		mediaDuration, segmentDuration float64
		n, i                           int
		want                           float64
	}{
		// bucketWidth=20; bucket 2 spans [40,60), midpoint 50, segment centered on it.
		{"centered on bucket midpoint, no clamp needed", 100, 2, 5, 2, 49},
		// bucketWidth=2 but segmentDuration=3 > bucketWidth (maxProportion<1):
		// first bucket's centered start would be negative, clamps to 0.
		{"clamps to 0 at the first bucket", 10, 3, 5, 0, 0},
		// same params, last bucket's centered start would overrun the end of
		// the video, clamps to mediaDuration-segmentDuration.
		{"clamps to mediaDuration-segmentDuration at the last bucket", 10, 3, 5, 4, 7},
		// single bucket spans the whole video; segment centered on its midpoint.
		{"single segment centered in the whole video", 20, 5, 1, 0, 7.5},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := HighlightSegmentStart(c.mediaDuration, c.n, c.i, c.segmentDuration)
			if math.Abs(got-c.want) > 1e-9 {
				t.Fatalf("got %v, want %v", got, c.want)
			}
		})
	}
}
