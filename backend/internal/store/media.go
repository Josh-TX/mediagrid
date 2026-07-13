package store

import (
	"database/sql"
	"fmt"
	"strings"

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
	rows, err := s.DB.Query(`SELECT id, path, width, height, filesize, mdate, duration, isvid FROM media`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []model.Media
	for rows.Next() {
		m, err := scanMedia(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, m)
	}
	return result, rows.Err()
}

// GetMediaByIDs loads exactly the media rows matching ids, via a single
// batched `WHERE id IN (...)` query (not one query per id). Used to hydrate
// RandCache's lean CacheTiles back into full Tiles on a cache hit. Ids with
// no matching row (the file was deleted via /api/delete after the
// shufflelist was cached) are simply absent from the returned map; callers
// synthesize a "deleted" placeholder rather than treating it as an error.
func (s *Store) GetMediaByIDs(ids []int) (map[int]model.Media, error) {
	result := make(map[int]model.Media, len(ids))
	if len(ids) == 0 {
		return result, nil
	}

	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	query := fmt.Sprintf(`SELECT id, path, width, height, filesize, mdate, duration, isvid FROM media WHERE id IN (%s)`, strings.Join(placeholders, ","))

	rows, err := s.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		m, err := scanMedia(rows)
		if err != nil {
			return nil, err
		}
		result[m.Id] = m
	}
	return result, rows.Err()
}

// scanMedia scans a single row shaped like `SELECT id, path, width, height,
// filesize, mdate, duration, isvid FROM media ...`, shared by ListAllMedia
// and GetMediaByIDs.
func scanMedia(rows *sql.Rows) (model.Media, error) {
	var m model.Media
	var duration sql.NullInt64
	var isvid int
	if err := rows.Scan(&m.Id, &m.Path, &m.Width, &m.Height, &m.Filesize, &m.Mdate, &duration, &isvid); err != nil {
		return model.Media{}, err
	}
	m.Duration = int(duration.Int64)
	m.IsVid = isvid != 0
	return m, nil
}
