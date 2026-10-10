package model

// LibrarySettings are the global StartsWith path filters that decide what
// Scan walks and what Scan + Clean keeps. StartsWith entries match the path
// prefix; Contains entries match anywhere in the path. Stored as a single row in the
// `library_settings` table and round-trips through GET/POST /api/library.
type LibrarySettings struct {
	WhitelistCSV         string `json:"whitelistCSV"`
	BlacklistCSV         string `json:"blacklistCSV"`
	WhitelistContainsCSV string `json:"whitelistContainsCSV"`
	BlacklistContainsCSV string `json:"blacklistContainsCSV"`
}
