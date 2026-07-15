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

	// Everything already serializes through the single connection above, so
	// WAL's concurrent-reader benefit doesn't apply here; the default
	// rollback journal keeps the on-disk footprint to one file instead of
	// leaving -wal/-shm files behind.
	if _, err := db.Exec(`PRAGMA journal_mode=DELETE`); err != nil {
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
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
  includeVids INTEGER NOT NULL,
  includeImages INTEGER NOT NULL,
  includePortrait INTEGER NOT NULL,
  includeLandscape INTEGER NOT NULL,
  minDuration INTEGER NOT NULL,
  maxDuration INTEGER NOT NULL,
  whitelistCSV TEXT NOT NULL,
  blacklistCSV TEXT NOT NULL,
  basePath TEXT NOT NULL
)`)
	if err != nil {
		return fmt.Errorf("creating presets table: %w", err)
	}

	// general_settings holds at most one row (id fixed to 1) of the global
	// Gallery/Player settings, analogous to gen_settings's singleton-row shape.
	_, err = s.DB.Exec(`
CREATE TABLE IF NOT EXISTS general_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tilePct REAL NOT NULL,
  tileCropX REAL NOT NULL,
  tileCropY REAL NOT NULL,
  defaultSort TEXT NOT NULL,
  tilePreviewAlways INTEGER NOT NULL,
  fallbackToOriginal INTEGER NOT NULL,
  autoplayInitiallyOn INTEGER NOT NULL,
  playbackSpeed1 REAL NOT NULL,
  playbackSpeed2 REAL NOT NULL,
  playerCropX REAL NOT NULL,
  playerCropY REAL NOT NULL,
  rewindSeconds INTEGER NOT NULL,
  forwardSeconds INTEGER NOT NULL
)`)
	if err != nil {
		return fmt.Errorf("creating general_settings table: %w", err)
	}

	// Columns added after general_settings first shipped need an explicit
	// ALTER TABLE for existing databases, since CREATE TABLE IF NOT EXISTS
	// only affects brand-new tables.
	if err := s.addColumnIfMissing("general_settings", "playbackSpeed1", "REAL NOT NULL DEFAULT 2"); err != nil {
		return err
	}
	if err := s.addColumnIfMissing("general_settings", "playbackSpeed2", "REAL NOT NULL DEFAULT 4"); err != nil {
		return err
	}

	// gen_settings holds at most one row (id fixed to 1), storing the last
	// submitted thumbnail/highlight generation settings as JSON so the gen
	// modals can prefill from whatever was used last time.
	_, err = s.DB.Exec(`
CREATE TABLE IF NOT EXISTS gen_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  thumbnail_settings TEXT NOT NULL,
  highlight_settings TEXT NOT NULL
)`)
	if err != nil {
		return fmt.Errorf("creating gen_settings table: %w", err)
	}
	return nil
}

// addColumnIfMissing runs ALTER TABLE ... ADD COLUMN for tables that
// predate the column, leaving already-migrated databases untouched.
func (s *Store) addColumnIfMissing(table, column, ddl string) error {
	rows, err := s.DB.Query(`SELECT name FROM pragma_table_info(?)`, table)
	if err != nil {
		return fmt.Errorf("inspecting %s columns: %w", table, err)
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return err
		}
		if name == column {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if _, err := s.DB.Exec(fmt.Sprintf(`ALTER TABLE %s ADD COLUMN %s %s`, table, column, ddl)); err != nil {
		return fmt.Errorf("adding column %s.%s: %w", table, column, err)
	}
	return nil
}
