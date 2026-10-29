package preview

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// ThumbnailPath returns the deterministic on-disk location of mediaPath's
// thumbnail: PREVIEW_ROOT/thumbnails/<mediaPath>.webp.
func ThumbnailPath(previewRoot, mediaPath string) string {
	return filepath.Join(previewRoot, "thumbnails", mediaPath+".webp")
}

// HighlightPath returns the deterministic on-disk location of mediaPath's
// highlight: PREVIEW_ROOT/highlights/<mediaPath>.mp4. ".mp4" is always
// appended, even when mediaPath already ends in ".mp4".
func HighlightPath(previewRoot, mediaPath string) string {
	return filepath.Join(previewRoot, "highlights", mediaPath+".mp4")
}

// spriteMarker separates the media path from the sprite's grid suffix in a
// sprite filename: PREVIEW_ROOT/sprites/<mediaPath>__ssr05c04.webp (5 rows,
// 4 columns). Rows/columns live in the filename because the DB stores no
// preview info and they vary per video.
const spriteMarker = "__ssr"

// SpritePath returns the on-disk location of mediaPath's sprite sheet for
// the given grid.
func SpritePath(previewRoot, mediaPath string, rows, cols int) string {
	return filepath.Join(previewRoot, "sprites", fmt.Sprintf("%s%s%02dc%02d.webp", mediaPath, spriteMarker, rows, cols))
}

// parseSpriteName returns the rows/cols encoded in a sprite filename if it is
// a sprite for exactly baseName (the media file's base name).
func parseSpriteName(fileName, baseName string) (rows, cols int, ok bool) {
	rest, found := strings.CutPrefix(fileName, baseName+spriteMarker)
	if !found {
		return 0, 0, false
	}
	rest, found = strings.CutSuffix(rest, ".webp")
	if !found {
		return 0, 0, false
	}
	rowStr, colStr, found := strings.Cut(rest, "c")
	if !found {
		return 0, 0, false
	}
	rows, err1 := strconv.Atoi(rowStr)
	cols, err2 := strconv.Atoi(colStr)
	if err1 != nil || err2 != nil || rows < 1 || cols < 1 {
		return 0, 0, false
	}
	return rows, cols, true
}

// SpriteIndex resolves sprite files by listing sprite directories. Each
// directory is read at most once per index, so tiles sharing a folder share
// one read. It is meant to be short-lived (e.g. one per request) so it never
// needs invalidation.
type SpriteIndex struct {
	previewRoot string
	dirs        map[string][]string
}

func NewSpriteIndex(previewRoot string) *SpriteIndex {
	return &SpriteIndex{previewRoot: previewRoot, dirs: map[string][]string{}}
}

// Find returns the sprite's path and grid for mediaPath, if one exists.
func (x *SpriteIndex) Find(mediaPath string) (path string, rows, cols int, ok bool) {
	dir := filepath.Join(x.previewRoot, "sprites", filepath.Dir(mediaPath))
	names, cached := x.dirs[dir]
	if !cached {
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			if !e.IsDir() {
				names = append(names, e.Name())
			}
		}
		x.dirs[dir] = names
	}
	base := filepath.Base(mediaPath)
	for _, n := range names {
		if r, c, match := parseSpriteName(n, base); match {
			return filepath.Join(dir, n), r, c, true
		}
	}
	return "", 0, 0, false
}

// FindSprite is a one-off SpriteIndex lookup.
func FindSprite(previewRoot, mediaPath string) (path string, rows, cols int, ok bool) {
	return NewSpriteIndex(previewRoot).Find(mediaPath)
}

// RemoveSprites deletes every sprite sheet for mediaPath, except the file at
// keepPath (pass "" to keep none).
func RemoveSprites(previewRoot, mediaPath, keepPath string) {
	dir := filepath.Join(previewRoot, "sprites", filepath.Dir(mediaPath))
	entries, _ := os.ReadDir(dir)
	base := filepath.Base(mediaPath)
	for _, e := range entries {
		if _, _, ok := parseSpriteName(e.Name(), base); !ok {
			continue
		}
		full := filepath.Join(dir, e.Name())
		if full != keepPath {
			os.Remove(full)
		}
	}
}
