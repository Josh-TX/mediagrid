package api

import (
	"net/http"

	"mediagrid/internal/shuffle"
	"mediagrid/internal/store"
	"mediagrid/internal/tasks"
)

type Server struct {
	store       *store.Store
	mediaRoot   string
	previewRoot string
	tasks       *tasks.Manager
	randCache   *shuffle.RandCache
	mux         *http.ServeMux
}

func NewServer(s *store.Store, mediaRoot, previewRoot string, taskMgr *tasks.Manager, staticHandler http.Handler) *Server {
	srv := &Server{
		store:       s,
		mediaRoot:   mediaRoot,
		previewRoot: previewRoot,
		tasks:       taskMgr,
		randCache:   shuffle.NewRandCache(),
		mux:         http.NewServeMux(),
	}
	srv.routes(staticHandler)
	return srv
}

func (s *Server) routes(staticHandler http.Handler) {
	s.mux.HandleFunc("GET /api/shuffle", s.handleShuffle)
	s.mux.HandleFunc("GET /api/presets", s.handleGetPresets)
	s.mux.HandleFunc("POST /api/presets", s.handlePostPresets)
	s.mux.HandleFunc("GET /media/{path...}", s.handleMedia)
	s.mux.HandleFunc("GET /thumbnail/{path...}", s.handleThumbnail)
	s.mux.HandleFunc("GET /highlight/{path...}", s.handleHighlight)
	s.mux.HandleFunc("GET /api/scan", s.handleScan)
	s.mux.HandleFunc("POST /api/gen-thumbnails", s.handleGenThumbnails)
	s.mux.HandleFunc("POST /api/gen-highlights", s.handleGenHighlights)
	s.mux.HandleFunc("GET /api/tasks", s.handleGetTasks)
	s.mux.HandleFunc("POST /api/tasks/{id}/cancel", s.handleCancelTask)
	s.mux.HandleFunc("GET /api/gen-settings", s.handleGetGenSettings)
	if staticHandler != nil {
		s.mux.Handle("/", staticHandler)
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}
