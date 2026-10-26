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

func setupMove(t *testing.T) (*Server, string, string) {
	t.Helper()
	mediaRoot, previewRoot := t.TempDir(), t.TempDir()
	st, err := store.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.DB.Close() })
	os.WriteFile(filepath.Join(mediaRoot, "a.mp4"), []byte("a"), 0o644)
	if err := st.InsertMedia(model.Media{Path: "a.mp4", Width: 1, Height: 1, IsVid: true}); err != nil {
		t.Fatal(err)
	}
	return &Server{store: st, mediaRoot: mediaRoot, previewRoot: previewRoot}, mediaRoot, previewRoot
}

func doMove(s *Server, rel, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPut, "/api/move/"+rel, strings.NewReader(body))
	req.SetPathValue("path", rel)
	rec := httptest.NewRecorder()
	s.handleMoveMedia(rec, req)
	return rec
}

func TestHandleMoveMedia_MovesIntoNewFolderAndRepointsRow(t *testing.T) {
	s, root, _ := setupMove(t)
	rec := doMove(s, "a.mp4", `{"destDir":"/x/y"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"path":"x/y/a.mp4"`) || !strings.Contains(rec.Body.String(), `"inLibrary":true`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(root, "x", "y", "a.mp4")); err != nil {
		t.Fatal(err)
	}
	if ok, _ := s.store.MediaExists("x/y/a.mp4"); !ok {
		t.Fatal("row not repointed")
	}
}

func TestHandleMoveMedia_ConflictNeedsOverwrite(t *testing.T) {
	s, root, pr := setupMove(t)
	os.MkdirAll(filepath.Join(root, "d"), 0o755)
	os.WriteFile(filepath.Join(root, "d", "a.mp4"), []byte("old"), 0o644)
	s.store.InsertMedia(model.Media{Path: "d/a.mp4", Width: 1, Height: 1, IsVid: true})
	thumb := preview.ThumbnailPath(pr, "d/a.mp4")
	os.MkdirAll(filepath.Dir(thumb), 0o755)
	os.WriteFile(thumb, []byte("t"), 0o644)

	if rec := doMove(s, "a.mp4", `{"destDir":"/d"}`); rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}
	if rec := doMove(s, "a.mp4", `{"destDir":"/d","overwrite":true}`); rec.Code != 200 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	if b, _ := os.ReadFile(filepath.Join(root, "d", "a.mp4")); string(b) != "a" {
		t.Fatalf("not overwritten: %q", b)
	}
	if _, err := os.Stat(thumb); !os.IsNotExist(err) {
		t.Fatal("overwritten file's preview should be removed")
	}
}

func TestHandleMoveMedia_OutsideLibraryDeletesRow(t *testing.T) {
	s, root, _ := setupMove(t)
	s.store.SaveLibrarySettings(model.LibrarySettings{BlacklistCSV: "out/"})
	rec := doMove(s, "a.mp4", `{"destDir":"/out"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"inLibrary":false`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(root, "out", "a.mp4")); err != nil {
		t.Fatal(err)
	}
	if ok, _ := s.store.MediaExists("a.mp4"); ok {
		t.Fatal("row should be deleted")
	}
}

func TestHandleMoveMedia_SameDirRejected(t *testing.T) {
	s, _, _ := setupMove(t)
	if rec := doMove(s, "a.mp4", `{"destDir":"/"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestHandleLs_ListsAndCanonicalizes(t *testing.T) {
	s, root, _ := setupMove(t)
	os.MkdirAll(filepath.Join(root, "b"), 0o755)
	req := httptest.NewRequest(http.MethodGet, "/api/ls?path=//b/../b/", nil)
	rec := httptest.NewRecorder()
	s.handleLs(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"path":"/b"`) || !strings.Contains(rec.Body.String(), `"exists":true`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/ls?path=/nope", nil)
	rec = httptest.NewRecorder()
	s.handleLs(rec, req)
	if !strings.Contains(rec.Body.String(), `"exists":false`) {
		t.Fatalf("got %s", rec.Body.String())
	}
}

func TestHandleMoveMedia_MoveWithRename(t *testing.T) {
	s, root, _ := setupMove(t)
	rec := doMove(s, "a.mp4", `{"destDir":"/d","newName":"b.mp4"}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"path":"d/b.mp4"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(root, "d", "b.mp4")); err != nil {
		t.Fatal(err)
	}
	if rec := doMove(s, "d/b.mp4", `{"destDir":"/d","newName":"x/y.mp4"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", rec.Code)
	}
}

func TestHandleMoveMedia_CopyKeepsSourceAndAddsRow(t *testing.T) {
	s, root, pr := setupMove(t)
	thumb := preview.ThumbnailPath(pr, "a.mp4")
	os.MkdirAll(filepath.Dir(thumb), 0o755)
	os.WriteFile(thumb, []byte("t"), 0o644)

	rec := doMove(s, "a.mp4", `{"destDir":"/d","copy":true}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"path":"d/a.mp4"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	for _, p := range []string{filepath.Join(root, "a.mp4"), filepath.Join(root, "d", "a.mp4"), thumb, preview.ThumbnailPath(pr, "d/a.mp4")} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("missing %s: %v", p, err)
		}
	}
	for _, p := range []string{"a.mp4", "d/a.mp4"} {
		if ok, _ := s.store.MediaExists(p); !ok {
			t.Fatalf("no row for %s", p)
		}
	}
}

func TestHandleMoveMedia_CopyOutsideLibraryAddsNoRow(t *testing.T) {
	s, root, _ := setupMove(t)
	s.store.SaveLibrarySettings(model.LibrarySettings{BlacklistCSV: "out/"})
	rec := doMove(s, "a.mp4", `{"destDir":"/out","copy":true}`)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"inLibrary":false`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(root, "out", "a.mp4")); err != nil {
		t.Fatal(err)
	}
	if ok, _ := s.store.MediaExists("a.mp4"); !ok {
		t.Fatal("source row should remain")
	}
	if ok, _ := s.store.MediaExists("out/a.mp4"); ok {
		t.Fatal("no row expected outside library")
	}
}

func TestHandleMoveMedia_CopyOverwrite(t *testing.T) {
	s, root, _ := setupMove(t)
	os.MkdirAll(filepath.Join(root, "d"), 0o755)
	os.WriteFile(filepath.Join(root, "d", "a.mp4"), []byte("old"), 0o644)
	s.store.InsertMedia(model.Media{Path: "d/a.mp4", Width: 9, Height: 9, IsVid: true})
	if rec := doMove(s, "a.mp4", `{"destDir":"/d","copy":true}`); rec.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", rec.Code)
	}
	if rec := doMove(s, "a.mp4", `{"destDir":"/d","copy":true,"overwrite":true}`); rec.Code != 200 {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	if b, _ := os.ReadFile(filepath.Join(root, "d", "a.mp4")); string(b) != "a" {
		t.Fatalf("got %q", b)
	}
	if m, ok, _ := s.store.GetMediaByPath("d/a.mp4"); !ok || m.Width != 1 {
		t.Fatalf("row not replaced: %+v", m)
	}
}
