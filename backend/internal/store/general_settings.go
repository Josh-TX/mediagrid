package store

import (
	"database/sql"

	"mediagrid/internal/model"
)

const generalSettingsColumns = `tilePct, tileCropX, tileCropY, defaultSort, tilePreviewAlways, fallbackToOriginal,
	autoplayInitiallyOn, playbackSpeed1, playbackSpeed2, playerCropX, playerCropY, rewindSeconds, forwardSeconds`

// GetGeneralSettings returns the single stored GeneralSettings row and
// whether it exists yet (false on a fresh DB, before the first save).
func (s *Store) GetGeneralSettings() (model.GeneralSettings, bool, error) {
	var g model.GeneralSettings
	var tilePreviewAlways, fallbackToOriginal, autoplayInitiallyOn int
	err := s.DB.QueryRow(`SELECT `+generalSettingsColumns+` FROM general_settings WHERE id = 1`).Scan(
		&g.TilePct, &g.TileCropX, &g.TileCropY, &g.DefaultSort, &tilePreviewAlways, &fallbackToOriginal,
		&autoplayInitiallyOn, &g.PlaybackSpeed1, &g.PlaybackSpeed2, &g.PlayerCropX, &g.PlayerCropY, &g.RewindSeconds, &g.ForwardSeconds,
	)
	if err == sql.ErrNoRows {
		return model.GeneralSettings{}, false, nil
	}
	if err != nil {
		return model.GeneralSettings{}, false, err
	}
	g.TilePreviewAlways = tilePreviewAlways != 0
	g.FallbackToOriginal = fallbackToOriginal != 0
	g.AutoplayInitiallyOn = autoplayInitiallyOn != 0
	return g, true, nil
}

// SaveGeneralSettings upserts the single GeneralSettings row, full-replace.
func (s *Store) SaveGeneralSettings(g model.GeneralSettings) error {
	_, err := s.DB.Exec(`
INSERT INTO general_settings (id, `+generalSettingsColumns+`)
VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  tilePct = excluded.tilePct,
  tileCropX = excluded.tileCropX,
  tileCropY = excluded.tileCropY,
  defaultSort = excluded.defaultSort,
  tilePreviewAlways = excluded.tilePreviewAlways,
  fallbackToOriginal = excluded.fallbackToOriginal,
  autoplayInitiallyOn = excluded.autoplayInitiallyOn,
  playbackSpeed1 = excluded.playbackSpeed1,
  playbackSpeed2 = excluded.playbackSpeed2,
  playerCropX = excluded.playerCropX,
  playerCropY = excluded.playerCropY,
  rewindSeconds = excluded.rewindSeconds,
  forwardSeconds = excluded.forwardSeconds`,
		g.TilePct, g.TileCropX, g.TileCropY, g.DefaultSort, boolToInt(g.TilePreviewAlways), boolToInt(g.FallbackToOriginal),
		boolToInt(g.AutoplayInitiallyOn), g.PlaybackSpeed1, g.PlaybackSpeed2, g.PlayerCropX, g.PlayerCropY, g.RewindSeconds, g.ForwardSeconds,
	)
	return err
}
