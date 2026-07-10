package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

type Store struct {
	DB *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// sqlite via modernc.org driver doesn't handle concurrent writers well;
	// a single connection avoids "database is locked" errors from this app's own goroutines.
	db.SetMaxOpenConns(1)

	if _, err := db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		return nil, err
	}

	s := &Store{DB: db}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) migrate() error {
	_, err := s.DB.Exec(`
CREATE TABLE IF NOT EXISTS media (
  path TEXT PRIMARY KEY,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  filesize INTEGER NOT NULL,
  mdate INTEGER NOT NULL,
  duration INTEGER,
  isvid INTEGER NOT NULL
)`)
	if err != nil {
		return fmt.Errorf("creating media table: %w", err)
	}

	_, err = s.DB.Exec(`
CREATE TABLE IF NOT EXISTS presets (
  name TEXT PRIMARY KEY,
  tilePct REAL NOT NULL,
  tileCropX REAL NOT NULL,
  tileCropY REAL NOT NULL,
  defaultSort TEXT NOT NULL,
  autoPlayTile TEXT NOT NULL,
  fallbackToOriginal INTEGER NOT NULL,
  includeVids INTEGER NOT NULL,
  includeImages INTEGER NOT NULL,
  includePortrait INTEGER NOT NULL,
  includeLandscape INTEGER NOT NULL,
  minDuration INTEGER NOT NULL,
  maxDuration INTEGER NOT NULL,
  whitelistCSV TEXT NOT NULL,
  blacklistCSV TEXT NOT NULL,
  basePath TEXT NOT NULL,
  onVidEnd TEXT NOT NULL,
  playerCropX REAL NOT NULL,
  playerCropY REAL NOT NULL,
  rewindSeconds INTEGER NOT NULL,
  forwardSeconds INTEGER NOT NULL
)`)
	if err != nil {
		return fmt.Errorf("creating presets table: %w", err)
	}
	return nil
}
