package preview

import "path/filepath"

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
