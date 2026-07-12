package store

import (
	"mediagrid/internal/model"
)

const presetColumns = `name, includeVids, includeImages, includePortrait, includeLandscape, minDuration, maxDuration,
	whitelistCSV, blacklistCSV, basePath`

func (s *Store) ListPresets() ([]model.Preset, error) {
	rows, err := s.DB.Query(`SELECT ` + presetColumns + ` FROM presets`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []model.Preset
	for rows.Next() {
		var p model.Preset
		var includeVids, includeImages, includePortrait, includeLandscape int
		err := rows.Scan(
			&p.Name, &includeVids, &includeImages, &includePortrait, &includeLandscape,
			&p.MinDuration, &p.MaxDuration, &p.WhitelistCSV, &p.BlacklistCSV, &p.BasePath,
		)
		if err != nil {
			return nil, err
		}
		p.IncludeVids = includeVids != 0
		p.IncludeImages = includeImages != 0
		p.IncludePortrait = includePortrait != 0
		p.IncludeLandscape = includeLandscape != 0
		result = append(result, p)
	}
	return result, rows.Err()
}

// ReplacePresets wholesale-replaces the presets table with the given list, atomically.
func (s *Store) ReplacePresets(presets []model.Preset) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM presets`); err != nil {
		return err
	}

	stmt, err := tx.Prepare(`INSERT INTO presets (` + presetColumns + `) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, p := range presets {
		_, err := stmt.Exec(
			p.Name, boolToInt(p.IncludeVids), boolToInt(p.IncludeImages), boolToInt(p.IncludePortrait), boolToInt(p.IncludeLandscape),
			p.MinDuration, p.MaxDuration, p.WhitelistCSV, p.BlacklistCSV, p.BasePath,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
