package shuffle

// Params holds every /api/shuffle query parameter relevant to filtering,
// sorting, and layout. MinR/MaxR are nil when the caller omitted them.
type Params struct {
	TilePct float64
	ScreenW int
	ScreenH int

	MinR *int
	MaxR *int

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

type PreviewData struct {
	Path     string `json:"path"`
	W        int    `json:"w"`
	H        int    `json:"h"`
	Filesize int64  `json:"filesize"`
	Mdate    int64  `json:"mdate"`
	Duration int    `json:"duration"`
	IsVid    bool   `json:"isVid"`
}

type Tile struct {
	TileI   int         `json:"tilei"`
	W       int         `json:"w"`
	Path    string      `json:"path"`
	IsVid   bool        `json:"isVid"`
	Preview PreviewData `json:"preview"`
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
