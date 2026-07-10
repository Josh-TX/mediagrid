package api

import "testing"

func TestResolveRowRange(t *testing.T) {
	intp := func(n int) *int { return &n }

	cases := []struct {
		name           string
		minR, maxR     *int
		totalRows      int
		wantLo, wantHi int
	}{
		{"defaults to full range", nil, nil, 10, 0, 10},
		{"explicit range", intp(2), intp(5), 10, 2, 5},
		{"maxr=20 on a 10-row list returns all 10 (clamped)", nil, intp(20), 10, 0, 10},
		{"minr clamped to zero", intp(-5), nil, 10, 0, 10},
		{"empty result set", nil, nil, 0, 0, 0},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			lo, hi := resolveRowRange(c.minR, c.maxR, c.totalRows)
			if lo != c.wantLo || hi != c.wantHi {
				t.Fatalf("got (%d, %d), want (%d, %d)", lo, hi, c.wantLo, c.wantHi)
			}
		})
	}
}
