package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestHandleThumbnail_ServesGeneratedFile(t *testing.T) {
	previewRoot := t.TempDir()
	thumbDir := filepath.Join(previewRoot, "thumbnails", "sub")
	if err := os.MkdirAll(thumbDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(thumbDir, "a.jpg.webp"), []byte("thumb-bytes"), 0o644); err != nil {
		t.Fatal(err)
	}

	s := &Server{previewRoot: previewRoot}
	req := httptest.NewRequest(http.MethodGet, "/thumbnail/sub/a.jpg", nil)
	req.SetPathValue("path", "sub/a.jpg")
	rec := httptest.NewRecorder()

	s.handleThumbnail(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", rec.Code)
	}
	if rec.Body.String() != "thumb-bytes" {
		t.Fatalf("got body %q, want %q", rec.Body.String(), "thumb-bytes")
	}
}

func TestHandleHighlight_ServesGeneratedFile(t *testing.T) {
	previewRoot := t.TempDir()
	highlightDir := filepath.Join(previewRoot, "highlights")
	if err := os.MkdirAll(highlightDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(highlightDir, "clip.mp4.mp4"), []byte("highlight-bytes"), 0o644); err != nil {
		t.Fatal(err)
	}

	s := &Server{previewRoot: previewRoot}
	req := httptest.NewRequest(http.MethodGet, "/highlight/clip.mp4", nil)
	req.SetPathValue("path", "clip.mp4")
	rec := httptest.NewRecorder()

	s.handleHighlight(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", rec.Code)
	}
	if rec.Body.String() != "highlight-bytes" {
		t.Fatalf("got body %q, want %q", rec.Body.String(), "highlight-bytes")
	}
}

// Both handlers derive their on-disk path from previewRoot + a fixed
// subfolder/extension, so a "../" in the path param can't actually escape
// previewRoot the way it could for /media (there's no equivalent of joining
// straight onto mediaRoot) — but serveGuarded still exists as the same
// defense-in-depth used by /media, so exercise it here too.
func TestHandleThumbnail_RejectsPathEscapingPreviewRoot(t *testing.T) {
	previewRoot := t.TempDir()
	s := &Server{previewRoot: previewRoot}
	req := httptest.NewRequest(http.MethodGet, "/thumbnail/..%2f..%2fetc%2fpasswd", nil)
	req.SetPathValue("path", "../../etc/passwd")
	rec := httptest.NewRecorder()

	s.handleThumbnail(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got status %d, want 400", rec.Code)
	}
}
