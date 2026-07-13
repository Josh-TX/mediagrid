package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"mediagrid/internal/model"
	"mediagrid/internal/preview"
	"mediagrid/internal/store"
)

func TestHandleDeleteMedia_RemovesFilePreviewsAndRow(t *testing.T) {
	mediaRoot := t.TempDir()
	previewRoot := t.TempDir()

	mediaPath := filepath.Join(mediaRoot, "sub", "clip.mp4")
	if err := os.MkdirAll(filepath.Dir(mediaPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(mediaPath, []byte("video-bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	thumbPath := preview.ThumbnailPath(previewRoot, "sub/clip.mp4")
	highlightPath := preview.HighlightPath(previewRoot, "sub/clip.mp4")
	for _, p := range []string{thumbPath, highlightPath} {
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer st.DB.Close()
	if err := st.InsertMedia(model.Media{Path: "sub/clip.mp4", Width: 100, Height: 100, IsVid: true}); err != nil {
		t.Fatalf("InsertMedia: %v", err)
	}

	s := &Server{store: st, mediaRoot: mediaRoot, previewRoot: previewRoot}
	req := httptest.NewRequest(http.MethodDelete, "/api/delete/sub/clip.mp4", nil)
	req.SetPathValue("path", "sub/clip.mp4")
	rec := httptest.NewRecorder()

	s.handleDeleteMedia(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got status %d, want 204: %s", rec.Code, rec.Body.String())
	}
	for _, p := range []string{mediaPath, thumbPath, highlightPath} {
		if _, err := os.Stat(p); !os.IsNotExist(err) {
			t.Fatalf("expected %s to be removed, stat err: %v", p, err)
		}
	}
	exists, err := st.MediaExists("sub/clip.mp4")
	if err != nil {
		t.Fatalf("MediaExists: %v", err)
	}
	if exists {
		t.Fatalf("expected media row to be deleted")
	}
}

// There's no UI trigger for this endpoint yet, so its own semantics stay
// simple per the spec: a path with no matching file/row is treated as
// already-deleted rather than erroring.
func TestHandleDeleteMedia_MissingPathIsIdempotent(t *testing.T) {
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer st.DB.Close()

	s := &Server{store: st, mediaRoot: t.TempDir(), previewRoot: t.TempDir()}
	req := httptest.NewRequest(http.MethodDelete, "/api/delete/nope.jpg", nil)
	req.SetPathValue("path", "nope.jpg")
	rec := httptest.NewRecorder()

	s.handleDeleteMedia(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got status %d, want 204: %s", rec.Code, rec.Body.String())
	}
}

func TestHandleDeleteMedia_RejectsPathEscapingMediaRoot(t *testing.T) {
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer st.DB.Close()

	s := &Server{store: st, mediaRoot: t.TempDir(), previewRoot: t.TempDir()}
	req := httptest.NewRequest(http.MethodDelete, "/api/delete/..%2f..%2fetc%2fpasswd", nil)
	req.SetPathValue("path", "../../etc/passwd")
	rec := httptest.NewRecorder()

	s.handleDeleteMedia(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got status %d, want 400", rec.Code)
	}
}
