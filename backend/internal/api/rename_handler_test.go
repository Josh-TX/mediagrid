package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mediagrid/internal/model"
	"mediagrid/internal/preview"
	"mediagrid/internal/store"
)

func newRenameRequest(relPath, newName string) *http.Request {
	req := httptest.NewRequest(http.MethodPut, "/api/rename/"+relPath, strings.NewReader(`{"newName":"`+newName+`"}`))
	req.SetPathValue("path", relPath)
	return req
}

func TestHandleRenameMedia_RenamesFilePreviewsAndRow(t *testing.T) {
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
	req := newRenameRequest("sub/clip.mp4", "renamed.mp4")
	rec := httptest.NewRecorder()

	s.handleRenameMedia(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got status %d, want 204: %s", rec.Code, rec.Body.String())
	}
	// Old paths are gone.
	for _, p := range []string{mediaPath, thumbPath, highlightPath} {
		if _, err := os.Stat(p); !os.IsNotExist(err) {
			t.Fatalf("expected %s to no longer exist, stat err: %v", p, err)
		}
	}
	// New paths exist.
	newMediaPath := filepath.Join(mediaRoot, "sub", "renamed.mp4")
	newThumbPath := preview.ThumbnailPath(previewRoot, "sub/renamed.mp4")
	newHighlightPath := preview.HighlightPath(previewRoot, "sub/renamed.mp4")
	for _, p := range []string{newMediaPath, newThumbPath, newHighlightPath} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("expected %s to exist: %v", p, err)
		}
	}

	exists, err := st.MediaExists("sub/renamed.mp4")
	if err != nil {
		t.Fatalf("MediaExists: %v", err)
	}
	if !exists {
		t.Fatalf("expected media row at new path")
	}
	exists, err = st.MediaExists("sub/clip.mp4")
	if err != nil {
		t.Fatalf("MediaExists: %v", err)
	}
	if exists {
		t.Fatalf("expected media row at old path to be gone")
	}
}

// A file with no generated preview yet is a normal, non-error case for
// rename — only the media file itself needs to move.
func TestHandleRenameMedia_MissingPreviewsAreFine(t *testing.T) {
	mediaRoot := t.TempDir()
	previewRoot := t.TempDir()

	mediaPath := filepath.Join(mediaRoot, "photo.jpg")
	if err := os.WriteFile(mediaPath, []byte("img-bytes"), 0o644); err != nil {
		t.Fatal(err)
	}

	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer st.DB.Close()
	if err := st.InsertMedia(model.Media{Path: "photo.jpg", Width: 100, Height: 100}); err != nil {
		t.Fatalf("InsertMedia: %v", err)
	}

	s := &Server{store: st, mediaRoot: mediaRoot, previewRoot: previewRoot}
	req := newRenameRequest("photo.jpg", "renamed.jpg")
	rec := httptest.NewRecorder()

	s.handleRenameMedia(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got status %d, want 204: %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(mediaRoot, "renamed.jpg")); err != nil {
		t.Fatalf("expected renamed file to exist: %v", err)
	}
}

func TestHandleRenameMedia_MissingSourceReturns404(t *testing.T) {
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer st.DB.Close()

	s := &Server{store: st, mediaRoot: t.TempDir(), previewRoot: t.TempDir()}
	req := newRenameRequest("nope.jpg", "renamed.jpg")
	rec := httptest.NewRecorder()

	s.handleRenameMedia(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("got status %d, want 404", rec.Code)
	}
}

func TestHandleRenameMedia_TargetCollisionReturns409(t *testing.T) {
	mediaRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(mediaRoot, "a.jpg"), []byte("a"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(mediaRoot, "b.jpg"), []byte("b"), 0o644); err != nil {
		t.Fatal(err)
	}

	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer st.DB.Close()
	if err := st.InsertMedia(model.Media{Path: "a.jpg", Width: 1, Height: 1}); err != nil {
		t.Fatalf("InsertMedia: %v", err)
	}

	s := &Server{store: st, mediaRoot: mediaRoot, previewRoot: t.TempDir()}
	req := newRenameRequest("a.jpg", "b.jpg")
	rec := httptest.NewRecorder()

	s.handleRenameMedia(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("got status %d, want 409: %s", rec.Code, rec.Body.String())
	}
	// Nothing should have moved.
	if _, err := os.Stat(filepath.Join(mediaRoot, "a.jpg")); err != nil {
		t.Fatalf("expected a.jpg to still exist: %v", err)
	}
}

func TestHandleRenameMedia_RejectsNewNameWithPathSeparator(t *testing.T) {
	mediaRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(mediaRoot, "a.jpg"), []byte("a"), 0o644); err != nil {
		t.Fatal(err)
	}

	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	defer st.DB.Close()
	if err := st.InsertMedia(model.Media{Path: "a.jpg", Width: 1, Height: 1}); err != nil {
		t.Fatalf("InsertMedia: %v", err)
	}

	s := &Server{store: st, mediaRoot: mediaRoot, previewRoot: t.TempDir()}
	req := newRenameRequest("a.jpg", "../escaped.jpg")
	rec := httptest.NewRecorder()

	s.handleRenameMedia(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got status %d, want 400: %s", rec.Code, rec.Body.String())
	}
}
