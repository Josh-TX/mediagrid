package shuffle

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

const cacheTTL = 30 * time.Minute

type cacheEntry struct {
	rows       []Row
	totalTiles int
	expiresAt  time.Time
}

// RandCache holds the computed row layout for sort=rand requests, keyed by
// every filter param plus screenW/tilePct (since those also determine row
// boundaries). TTL is sliding: every Get hit pushes expiresAt out again.
type RandCache struct {
	mu      sync.Mutex
	entries map[string]*cacheEntry
}

func NewRandCache() *RandCache {
	return &RandCache{entries: make(map[string]*cacheEntry)}
}

func (c *RandCache) Get(key string) (rows []Row, totalTiles int, ok bool) {
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

func (c *RandCache) Set(key string, rows []Row, totalTiles int) {
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
