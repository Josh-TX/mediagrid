package shuffle

import (
	"math"
	"math/rand"

	"mediagrid/internal/model"
)

// clusterK is the number of aspect-ratio clusters BuildRandomRows starts
// from before dissolving undersized ones. Clamped to len(media) for small
// filtered sets.
const clusterK = 5

// kmeansMaxIterations caps Lloyd's algorithm; 1D k-means on a handful of
// clusters converges in only a few passes in practice.
const kmeansMaxIterations = 20

// cluster is a group of media with similar aspect ratio. centroid is kept
// as the exact mean aspect ratio of its current membership, so it can be
// recomputed cheaply (weighted average) whenever clusters merge.
type cluster struct {
	media    []model.Media
	centroid float64
}

// BuildRandomRows builds the sort=random row layout. Filtered media is
// shuffled once (that order drives all downstream randomness), grouped into
// clusters by aspect ratio via 1D k-means, and any cluster too small to
// fill even one row is dissolved into its nearest neighbor. Each surviving
// cluster is packed into "pure" rows (tiles of similar aspect ratio); those
// pure rows are then fully randomized in order. Any tiles that couldn't
// complete a pure row are pooled, reshuffled, and packed into "impure" rows
// appended at the very end.
func BuildRandomRows(media []model.Media, screenW, screenH int, tilePct float64) []Row {
	shuffled := RandOrder(media)
	if len(shuffled) == 0 {
		return nil
	}

	k := clusterK
	if k > len(shuffled) {
		k = len(shuffled)
	}
	clusters := kmeans1D(shuffled, k)
	survivors := dissolveClusters(clusters, screenW, screenH, tilePct)

	var pureRows []Row
	var impurePool []model.Media
	for _, c := range survivors {
		rows, leftover := packClusterRows(c.media, screenW, screenH, tilePct)
		pureRows = append(pureRows, rows...)
		impurePool = append(impurePool, leftover...)
	}

	rand.Shuffle(len(pureRows), func(i, j int) {
		pureRows[i], pureRows[j] = pureRows[j], pureRows[i]
	})

	impureRows := BuildRows(RandOrder(impurePool), screenW, screenH, tilePct)

	allRows := append(pureRows, impureRows...)
	return renumberRows(allRows)
}

// kmeans1D clusters media into k groups by raw aspect ratio using Lloyd's
// algorithm. Centroids are initialized evenly spread across the filtered
// set's min-max aspect ratio range. Empty clusters (possible when k exceeds
// the number of distinct aspect ratios) are dropped from the result.
func kmeans1D(media []model.Media, k int) []cluster {
	if len(media) == 0 {
		return nil
	}

	minAR, maxAR := media[0].AspectRatio(), media[0].AspectRatio()
	for _, m := range media[1:] {
		ar := m.AspectRatio()
		if ar < minAR {
			minAR = ar
		}
		if ar > maxAR {
			maxAR = ar
		}
	}

	centroids := make([]float64, k)
	if k == 1 {
		centroids[0] = (minAR + maxAR) / 2
	} else {
		step := (maxAR - minAR) / float64(k-1)
		for i := range centroids {
			centroids[i] = minAR + step*float64(i)
		}
	}

	assignments := make([]int, len(media))
	for iter := 0; iter < kmeansMaxIterations; iter++ {
		changed := false
		for i, m := range media {
			ar := m.AspectRatio()
			best := 0
			bestDist := math.Abs(ar - centroids[0])
			for c := 1; c < k; c++ {
				if d := math.Abs(ar - centroids[c]); d < bestDist {
					bestDist = d
					best = c
				}
			}
			if assignments[i] != best {
				assignments[i] = best
				changed = true
			}
		}
		if !changed && iter > 0 {
			break
		}

		sums := make([]float64, k)
		counts := make([]int, k)
		for i, m := range media {
			c := assignments[i]
			sums[c] += m.AspectRatio()
			counts[c]++
		}
		for c := 0; c < k; c++ {
			if counts[c] > 0 {
				centroids[c] = sums[c] / float64(counts[c])
			}
		}
	}

	clusters := make([]cluster, k)
	for c := range clusters {
		clusters[c].centroid = centroids[c]
	}
	for i, m := range media {
		c := assignments[i]
		clusters[c].media = append(clusters[c].media, m)
	}

	result := clusters[:0]
	for _, c := range clusters {
		if len(c.media) > 0 {
			result = append(result, c)
		}
	}
	return result
}

// dissolveClusters iteratively tests the smallest not-yet-confirmed cluster
// against packClusterRows: if it can fill at least one pure row it's
// confirmed a survivor, otherwise it's dissolved entirely into whichever
// other remaining cluster currently has the closest centroid (survivor or
// not), which has its centroid recomputed as the mean of its new combined
// membership. This repeats until every remaining cluster is confirmed, or
// (for very small filtered sets) only one cluster remains and it still
// can't fill a row — that cluster is left as-is and everything in it ends
// up in the impure pool via the caller's packClusterRows call.
func dissolveClusters(clusters []cluster, screenW, screenH int, tilePct float64) []cluster {
	confirmed := make([]bool, len(clusters))

	for {
		smallest := -1
		for i := range clusters {
			if confirmed[i] || len(clusters[i].media) == 0 {
				continue
			}
			if smallest == -1 || len(clusters[i].media) < len(clusters[smallest].media) {
				smallest = i
			}
		}
		if smallest == -1 {
			break
		}

		rows, _ := packClusterRows(clusters[smallest].media, screenW, screenH, tilePct)
		if len(rows) > 0 {
			confirmed[smallest] = true
			continue
		}

		nearest := -1
		for i := range clusters {
			if i == smallest || len(clusters[i].media) == 0 {
				continue
			}
			if nearest == -1 || math.Abs(clusters[i].centroid-clusters[smallest].centroid) < math.Abs(clusters[nearest].centroid-clusters[smallest].centroid) {
				nearest = i
			}
		}
		if nearest == -1 {
			// Only one non-empty cluster remains and it still isn't big
			// enough. Nothing left to merge into; stop so the caller's
			// packClusterRows sends all of it to the impure pool.
			confirmed[smallest] = true
			continue
		}

		mergedCount := len(clusters[nearest].media) + len(clusters[smallest].media)
		clusters[nearest].centroid = (clusters[nearest].centroid*float64(len(clusters[nearest].media)) +
			clusters[smallest].centroid*float64(len(clusters[smallest].media))) / float64(mergedCount)
		clusters[nearest].media = append(clusters[nearest].media, clusters[smallest].media...)
		clusters[smallest].media = nil
	}

	result := make([]cluster, 0, len(clusters))
	for _, c := range clusters {
		if len(c.media) > 0 {
			result = append(result, c)
		}
	}
	return result
}

// packClusterRows packs media into rows exactly like BuildRows, except the
// final row is excluded from the result (and returned via leftover instead)
// if it's incomplete — closed only because media ran out, not because it
// hit the area threshold or maxTilesPerRow. Used both to test whether a
// cluster is "big enough" to fill a pure row and to actually build a
// surviving cluster's pure rows.
func packClusterRows(media []model.Media, screenW, screenH int, tilePct float64) (rows []Row, leftover []model.Media) {
	threshold := tilePct * float64(screenW) * float64(screenH)
	tileI := 0
	idx := 0
	n := len(media)

	for idx < n {
		row, widths, rowHeight, nextIdx, complete := packOneRow(media, idx, screenW, threshold)
		if !complete {
			leftover = append(leftover, row...)
			break
		}
		idx = nextIdx
		rows = append(rows, buildRow(len(rows), &tileI, row, widths, rowHeight))
	}

	return rows, leftover
}

// renumberRows reassigns sequential RowI/TileI across the full row list,
// since pure rows are built (and numbered) independently per cluster before
// being shuffled into their final order.
func renumberRows(rows []Row) []Row {
	tileI := 0
	for i := range rows {
		rows[i].RowI = i
		for j := range rows[i].Tiles {
			rows[i].Tiles[j].TileI = tileI
			tileI++
		}
	}
	return rows
}
