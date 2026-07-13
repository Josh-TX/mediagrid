package model

// Media is one row of the `media` table: a scanned image or video file.
// Width/Height already account for EXIF/container rotation, so AspectRatio
// always matches the file's actual display orientation.
//
// Id is the backend-only autoincrement primary key. It must never reach the
// frontend (hence json:"-"): model.Media is never marshaled directly to a
// JSON response anywhere, but the tag is defense-in-depth against that
// changing by accident.
type Media struct {
	Id       int    `json:"-"`
	Path     string `json:"path"`
	Width    int    `json:"w"`
	Height   int    `json:"h"`
	Filesize int64  `json:"filesize"`
	Mdate    int64  `json:"mdate"`
	Duration int    `json:"duration"`
	IsVid    bool   `json:"isVid"`
}

func (m Media) AspectRatio() float64 {
	return float64(m.Width) / float64(m.Height)
}
