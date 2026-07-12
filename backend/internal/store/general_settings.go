package store

import (
	"database/sql"

	"mediagrid/internal/model"
)

const generalSettingsColumns = `tilePct, tileCropX, tileCropY, defaultSort, autoPlayTile, fallbackToOriginal,
	onVidEnd, playerCropX, playerCropY, rewindSeconds, forwardSeconds`

// GetGeneralSettings returns the single stored GeneralSettings row and
// whether it exists yet (false on a fresh DB, before the first save).
func (s *Store) GetGeneralSettings() (model.GeneralSettings, bool, error) {
	var g model.GeneralSettings
	var fallbackToOriginal int
	err := s.DB.QueryRow(`SELECT `+generalSettingsColumns+` FROM general_settings WHERE id = 1`).Scan(
		&g.TilePct, &g.TileCropX, &g.TileCropY, &g.DefaultSort, &g.AutoPlayTile, &fallbackToOriginal,
		&g.OnVidEnd, &g.PlayerCropX, &g.PlayerCropY, &g.RewindSeconds, &g.ForwardSeconds,
	)
	if err == sql.ErrNoRows {
		return model.GeneralSettings{}, false, nil
	}
	if err != nil {
		return model.GeneralSettings{}, false, err
	}
	g.FallbackToOriginal = fallbackToOriginal != 0
	return g, true, nil
}

// SaveGeneralSettings upserts the single GeneralSettings row, full-replace.
func (s *Store) SaveGeneralSettings(g model.GeneralSettings) error {
	_, err := s.DB.Exec(`
INSERT INTO general_settings (id, `+generalSettingsColumns+`)
VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  tilePct = excluded.tilePct,
  tileCropX = excluded.tileCropX,
  tileCropY = excluded.tileCropY,
  defaultSort = excluded.defaultSort,
  autoPlayTile = excluded.autoPlayTile,
  fallbackToOriginal = excluded.fallbackToOriginal,
  onVidEnd = excluded.onVidEnd,
  playerCropX = excluded.playerCropX,
  playerCropY = excluded.playerCropY,
  rewindSeconds = excluded.rewindSeconds,
  forwardSeconds = excluded.forwardSeconds`,
		g.TilePct, g.TileCropX, g.TileCropY, g.DefaultSort, g.AutoPlayTile, boolToInt(g.FallbackToOriginal),
		g.OnVidEnd, g.PlayerCropX, g.PlayerCropY, g.RewindSeconds, g.ForwardSeconds,
	)
	return err
}
