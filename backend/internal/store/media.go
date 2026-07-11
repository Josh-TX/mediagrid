package store

import (
	"database/sql"

	"mediagrid/internal/model"
)

// Exists reports whether path is already recorded, so the scanner can skip re-probing it.
func (s *Store) MediaExists(path string) (bool, error) {
	var one int
	err := s.DB.QueryRow(`SELECT 1 FROM media WHERE path = ?`, path).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// DeleteMedia removes the media row at path, e.g. because the underlying
// file no longer exists on disk (see the Clean task).
func (s *Store) DeleteMedia(path string) error {
	_, err := s.DB.Exec(`DELETE FROM media WHERE path = ?`, path)
	return err
}

func (s *Store) InsertMedia(m model.Media) error {
	isvid := 0
	if m.IsVid {
		isvid = 1
	}
	_, err := s.DB.Exec(
		`INSERT INTO media (path, width, height, filesize, mdate, duration, isvid) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		m.Path, m.Width, m.Height, m.Filesize, m.Mdate, m.Duration, isvid,
	)
	return err
}

// ListAllMedia loads every scanned media row. Filtering/sorting happens in
// application code (see internal/shuffle), not in SQL.
func (s *Store) ListAllMedia() ([]model.Media, error) {
	rows, err := s.DB.Query(`SELECT path, width, height, filesize, mdate, duration, isvid FROM media`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []model.Media
	for rows.Next() {
		var m model.Media
		var duration sql.NullInt64
		var isvid int
		if err := rows.Scan(&m.Path, &m.Width, &m.Height, &m.Filesize, &m.Mdate, &duration, &isvid); err != nil {
			return nil, err
		}
		m.Duration = int(duration.Int64)
		m.IsVid = isvid != 0
		result = append(result, m)
	}
	return result, rows.Err()
}
