package shuffle

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"mediagrid/internal/model"
)

const cacheTTL = 30 * time.Minute

type cacheEntry struct {
	rows       []CacheRow
	totalTiles int
	expiresAt  time.Time
}

// RandCache holds the computed row layout for sort=rand requests, keyed by
// every filter param plus screenW/tilePct (since those also determine row
// boundaries). TTL is sliding: every Get hit pushes expiresAt out again.
//
// Rows are stored as the lean CacheRow/CacheTile shape rather than full
// Row/Tile, to keep the memory footprint of a potentially large cached
// shufflelist small. Callers rehydrate the requested page's CacheTiles back
// into full Tiles via a media-table lookup by Id (see HydrateTiles).
type RandCache struct {
	mu      sync.Mutex
	entries map[string]*cacheEntry
}

func NewRandCache() *RandCache {
	return &RandCache{entries: make(map[string]*cacheEntry)}
}

func (c *RandCache) Get(key string) (rows []CacheRow, totalTiles int, ok bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry, found := c.entries[key]
	if !found || time.Now().After(entry.expiresAt) {
		delete(c.entries, key)
		return nil, 0, false
	}
	entry.expiresAt = time.Now().Add(cacheTTL)
	return entry.rows, entry.totalTiles, true
}

func (c *RandCache) Set(key string, rows []CacheRow, totalTiles int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = &cacheEntry{
		rows:       rows,
		totalTiles: totalTiles,
		expiresAt:  time.Now().Add(cacheTTL),
	}
}

func (c *RandCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, key)
}

// CacheKey builds the rand-order cache key from the filter params plus
// screenW/tilePct. Order/format only needs to be stable and unique per
// distinct param combination, not human-readable.
func CacheKey(p Params) string {
	var b strings.Builder
	fmt.Fprintf(&b, "f=%s|exVids=%t|exImgs=%t|exPort=%t|exLand=%t|minDur=%d|maxDur=%d|wl=%s|bl=%s|basepath=%s|screenW=%d|tilePct=%g",
		p.F, p.ExVids, p.ExImgs, p.ExPort, p.ExLand, p.MinDur, p.MaxDur,
		strings.Join(p.Whitelist, ","), strings.Join(p.Blacklist, ","), p.BasePath,
		p.ScreenW, p.TilePct)
	return b.String()
}

// DeletedPath is the sentinel Tile.Path synthesized when a RandCache hit
// references a media Id whose row is gone (the file was deleted via
// /api/delete after this shufflelist was cached).
const DeletedPath = "//deleted"

// ToCacheRows strips full Rows down to the lean CacheRow/CacheTile shape for
// storage in RandCache.
func ToCacheRows(rows []Row) []CacheRow {
	cacheRows := make([]CacheRow, len(rows))
	for i, r := range rows {
		tiles := make([]CacheTile, len(r.Tiles))
		for j, t := range r.Tiles {
			tiles[j] = CacheTile{TileI: t.TileI, W: t.W, Id: t.Id}
		}
		cacheRows[i] = CacheRow{RowI: r.RowI, H: r.H, Tiles: tiles}
	}
	return cacheRows
}

// HydrateRows rebuilds full Rows from cached rows by looking up each
// CacheTile's Id in media (built from a single batched store query covering
// every Id on the page). An Id absent from media synthesizes a DeletedPath
// placeholder Tile with zero-value fields instead of erroring, since
// AUTOINCREMENT guarantees a missing Id means the file was deleted, not that
// something is wrong with the cache.
func HydrateRows(cacheRows []CacheRow, media map[int]model.Media) []Row {
	rows := make([]Row, len(cacheRows))
	for i, cr := range cacheRows {
		tiles := make([]Tile, len(cr.Tiles))
		for j, ct := range cr.Tiles {
			m, found := media[ct.Id]
			if !found {
				tiles[j] = Tile{TileI: ct.TileI, W: ct.W, Path: DeletedPath}
				continue
			}
			tiles[j] = Tile{
				TileI:    ct.TileI,
				W:        ct.W,
				Path:     m.Path,
				IsVid:    m.IsVid,
				Duration: m.Duration,
				Filesize: m.Filesize,
				Mdate:    m.Mdate,
				Preview: PreviewData{
					W: m.Width,
					H: m.Height,
				},
				Id: m.Id,
			}
		}
		rows[i] = Row{RowI: cr.RowI, H: cr.H, Tiles: tiles}
	}
	return rows
}
