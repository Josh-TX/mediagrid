package store

import "database/sql"

// GetGenSettings returns the last-saved thumbnail/highlight/sprite settings JSON.
// Either string is "" if that settings type has never been saved (the
// caller should fall back to hardcoded defaults in that case).
func (s *Store) GetGenSettings() (thumbnailJSON, highlightJSON, spriteJSON string, err error) {
	err = s.DB.QueryRow(`SELECT thumbnail_settings, highlight_settings, sprite_settings FROM gen_settings WHERE id = 1`).
		Scan(&thumbnailJSON, &highlightJSON, &spriteJSON)
	if err == sql.ErrNoRows {
		return "", "", "", nil
	}
	if err != nil {
		return "", "", "", err
	}
	return thumbnailJSON, highlightJSON, spriteJSON, nil
}

// SaveThumbnailSettings upserts just the thumbnail_settings column, leaving
// highlight_settings untouched (or "" if this is the first-ever row).
func (s *Store) SaveThumbnailSettings(json string) error {
	_, err := s.DB.Exec(`
INSERT INTO gen_settings (id, thumbnail_settings, highlight_settings, sprite_settings) VALUES (1, ?, '', '')
ON CONFLICT(id) DO UPDATE SET thumbnail_settings = excluded.thumbnail_settings`, json)
	return err
}

// SaveHighlightSettings upserts just the highlight_settings column, leaving
// thumbnail_settings untouched (or "" if this is the first-ever row).
func (s *Store) SaveHighlightSettings(json string) error {
	_, err := s.DB.Exec(`
INSERT INTO gen_settings (id, thumbnail_settings, highlight_settings, sprite_settings) VALUES (1, '', ?, '')
ON CONFLICT(id) DO UPDATE SET highlight_settings = excluded.highlight_settings`, json)
	return err
}

// SaveSpriteSettings upserts just the sprite_settings column, leaving the
// other settings untouched (or "" if this is the first-ever row).
func (s *Store) SaveSpriteSettings(json string) error {
	_, err := s.DB.Exec(`
INSERT INTO gen_settings (id, thumbnail_settings, highlight_settings, sprite_settings) VALUES (1, '', '', ?)
ON CONFLICT(id) DO UPDATE SET sprite_settings = excluded.sprite_settings`, json)
	return err
}
