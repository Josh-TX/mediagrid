package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"mediagrid/internal/model"
	"mediagrid/internal/shuffle"
	"mediagrid/internal/store"
)

// TestHandleShuffle_RandCacheHitHydratesDeletedTileGracefully covers the
// full RandCache miss -> hit round trip for sort=rand: a miss builds and
// caches the lean CacheRow/CacheTile shape, and a later hit rehydrates just
// the requested page's CacheTiles into full Tiles via a media-table lookup.
// If a cached Id's media row was deleted in between (no cache invalidation
// happens on delete, by design, since AUTOINCREMENT means the id can never
// point at a different file), the hit must synthesize a "//deleted"
// placeholder tile rather than erroring.
func TestHandleShuffle_RandCacheHitHydratesDeletedTileGracefully(t *testing.T) {
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer st.DB.Close()

	for _, m := range []model.Media{
		{Path: "a.jpg", Width: 100, Height: 100, Filesize: 1, Mdate: 1},
		{Path: "b.jpg", Width: 100, Height: 100, Filesize: 2, Mdate: 2},
	} {
		if err := st.InsertMedia(m); err != nil {
			t.Fatalf("InsertMedia: %v", err)
		}
	}

	s := &Server{store: st, previewRoot: t.TempDir(), randCache: shuffle.NewRandCache()}
	shuffleReq := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/shuffle?tilePct=1&screenW=1000&screenH=1000", nil)
		rec := httptest.NewRecorder()
		s.handleShuffle(rec, req)
		return rec
	}

	missRec := shuffleReq()
	if missRec.Code != http.StatusOK {
		t.Fatalf("miss: got status %d, want 200: %s", missRec.Code, missRec.Body.String())
	}
	var missResult shuffle.Result
	if err := json.Unmarshal(missRec.Body.Bytes(), &missResult); err != nil {
		t.Fatalf("decoding miss response: %v", err)
	}
	if missResult.TotalTiles != 2 {
		t.Fatalf("miss: got TotalTiles=%d, want 2", missResult.TotalTiles)
	}

	if err := st.DeleteMedia("b.jpg"); err != nil {
		t.Fatalf("DeleteMedia: %v", err)
	}

	hitRec := shuffleReq()
	if hitRec.Code != http.StatusOK {
		t.Fatalf("hit: got status %d, want 200: %s", hitRec.Code, hitRec.Body.String())
	}
	var hitResult shuffle.Result
	if err := json.Unmarshal(hitRec.Body.Bytes(), &hitResult); err != nil {
		t.Fatalf("decoding hit response: %v", err)
	}
	// TotalTiles reflects the cached shufflelist's size as of when it was
	// built, unaffected by the later delete.
	if hitResult.TotalTiles != 2 {
		t.Fatalf("hit: got TotalTiles=%d, want 2 (cache is not invalidated by delete)", hitResult.TotalTiles)
	}

	var deletedCount, aliveCount int
	for _, row := range hitResult.Rows {
		for _, tile := range row.Tiles {
			switch tile.Path {
			case "//deleted":
				deletedCount++
				if tile.Filesize != 0 || tile.Mdate != 0 || tile.IsVid || tile.Duration != 0 {
					t.Fatalf("deleted tile should have zero-value fields: %+v", tile)
				}
			case "a.jpg":
				aliveCount++
			}
		}
	}
	if deletedCount != 1 || aliveCount != 1 {
		t.Fatalf("got deletedCount=%d aliveCount=%d, want 1 and 1 (rows: %+v)", deletedCount, aliveCount, hitResult.Rows)
	}
}
