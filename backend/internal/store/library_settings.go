package store

import (
	"database/sql"

	"mediagrid/internal/model"
)

// GetLibrarySettings returns the stored LibrarySettings, or the zero value
// (no filtering) if never saved.
func (s *Store) GetLibrarySettings() (model.LibrarySettings, error) {
	var l model.LibrarySettings
	err := s.DB.QueryRow(`SELECT whitelistCSV, blacklistCSV, whitelistContainsCSV, blacklistContainsCSV FROM library_settings WHERE id = 1`).
		Scan(&l.WhitelistCSV, &l.BlacklistCSV, &l.WhitelistContainsCSV, &l.BlacklistContainsCSV)
	if err == sql.ErrNoRows {
		return model.LibrarySettings{}, nil
	}
	return l, err
}

// SaveLibrarySettings upserts the single LibrarySettings row, full-replace.
func (s *Store) SaveLibrarySettings(l model.LibrarySettings) error {
	_, err := s.DB.Exec(`
INSERT INTO library_settings (id, whitelistCSV, blacklistCSV, whitelistContainsCSV, blacklistContainsCSV) VALUES (1, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  whitelistCSV = excluded.whitelistCSV,
  blacklistCSV = excluded.blacklistCSV,
  whitelistContainsCSV = excluded.whitelistContainsCSV,
  blacklistContainsCSV = excluded.blacklistContainsCSV`, l.WhitelistCSV, l.BlacklistCSV, l.WhitelistContainsCSV, l.BlacklistContainsCSV)
	return err
}
