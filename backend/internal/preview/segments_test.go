package preview

import "testing"

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
