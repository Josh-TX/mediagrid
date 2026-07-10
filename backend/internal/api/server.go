package api

import (
	"net/http"

	"mediagrid/internal/shuffle"
	"mediagrid/internal/store"
)

type Server struct {
	store     *store.Store
	mediaRoot string
	randCache *shuffle.RandCache
	mux       *http.ServeMux
}

func NewServer(s *store.Store, mediaRoot string, staticHandler http.Handler) *Server {
	srv := &Server{
		store:     s,
		mediaRoot: mediaRoot,
		randCache: shuffle.NewRandCache(),
		mux:       http.NewServeMux(),
	}
	srv.routes(staticHandler)
	return srv
}

func (s *Server) routes(staticHandler http.Handler) {
	s.mux.HandleFunc("GET /api/shuffle", s.handleShuffle)
	s.mux.HandleFunc("GET /api/presets", s.handleGetPresets)
	s.mux.HandleFunc("POST /api/presets", s.handlePostPresets)
	s.mux.HandleFunc("GET /media/{path...}", s.handleMedia)
	if staticHandler != nil {
		s.mux.Handle("/", staticHandler)
	}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}
