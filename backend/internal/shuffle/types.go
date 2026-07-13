package shuffle

// Params holds every /api/shuffle query parameter relevant to filtering,
// sorting, and layout. SkipR/TakeR/TakeI are nil when the caller omitted them.
type Params struct {
	TilePct float64
	ScreenW int
	ScreenH int

	SkipR *int
	TakeR *int
	TakeI *int

	F    string
	Sort string
	Dir  string

	ExVids bool
	ExImgs bool
	ExPort bool
	ExLand bool

	MinDur int
	MaxDur int

	Whitelist []string
	Blacklist []string
	BasePath  string

	Reshuffle bool
}

// PreviewData describes the tile's Preview: the original media's dimensions
// (thumbnails/highlights are assumed to preserve aspect ratio, so these are
// never read back off the generated files themselves) plus whether a
// generated thumbnail/highlight file exists on disk. HasThumbnail/
// HasHighlight are left false by BuildRows/BuildRandomRows and are only
// populated afterward, for the specific page of tiles a /api/shuffle
// response actually returns (see handleShuffle) — checking existence across
// an entire shufflelist up front would mean stat-ing every media file.
type PreviewData struct {
	W            int  `json:"w"`
	H            int  `json:"h"`
	HasThumbnail bool `json:"hasThumbnail"`
	HasHighlight bool `json:"hasHighlight"`
}

type Tile struct {
	TileI    int         `json:"tilei"`
	W        int         `json:"w"`
	Path     string      `json:"path"`
	IsVid    bool        `json:"isVid"`
	Duration int         `json:"duration"`
	Filesize int64       `json:"filesize"`
	Mdate    int64       `json:"mdate"`
	Preview  PreviewData `json:"preview"`
	// Id is the source media's backend-only db id, threaded through layout
	// building so RandCache can store a lean CacheTile instead of a full
	// Tile. json:"-" keeps it structurally unreachable from the API response.
	Id int `json:"-"`
}

type Row struct {
	RowI  int    `json:"rowi"`
	H     int    `json:"h"`
	Tiles []Tile `json:"tiles"`
}

type Result struct {
	TotalRows  int   `json:"totalRows"`
	TotalTiles int   `json:"totalTiles"`
	Rows       []Row `json:"rows"`
}

// CacheTile is the lean, RandCache-only counterpart to Tile: just enough to
// re-derive a full Tile later via a media-table lookup by Id. Deliberately a
// separate type (not a Tile with fields zeroed) so RandCache doesn't pay for
// Tile's fixed-size fields or Path's variable-length string content.
type CacheTile struct {
	TileI int
	W     int
	Id    int
}

// CacheRow is the RandCache-only counterpart to Row.
type CacheRow struct {
	RowI  int
	H     int
	Tiles []CacheTile
}
