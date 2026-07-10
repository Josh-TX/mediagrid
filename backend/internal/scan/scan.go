package scan

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"math"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"mediagrid/internal/model"
	"mediagrid/internal/store"
)

var imageExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
}

var videoExts = map[string]bool{
	".mp4": true, ".webm": true, ".mov": true, ".mkv": true, ".avi": true, ".m4v": true,
}

// Run walks mediaRoot synchronously and records any media files not already
// present in the store. Callers wanting non-blocking startup should invoke
// this in its own goroutine.
func Run(s *store.Store, mediaRoot string) {
	err := filepath.WalkDir(mediaRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			log.Printf("scan: error walking %s: %v", path, err)
			return nil
		}
		name := d.Name()
		if path != mediaRoot && strings.HasPrefix(name, ".") {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&fs.ModeSymlink != 0 {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(name))
		isVid := videoExts[ext]
		if !isVid && !imageExts[ext] {
			return nil
		}

		relPath, err := filepath.Rel(mediaRoot, path)
		if err != nil {
			log.Printf("scan: error computing relative path for %s: %v", path, err)
			return nil
		}

		exists, err := s.MediaExists(relPath)
		if err != nil {
			log.Printf("scan: error checking existing media %s: %v", relPath, err)
			return nil
		}
		if exists {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			log.Printf("scan: error stating %s: %v", path, err)
			return nil
		}

		width, height, duration, err := probe(path, isVid)
		if err != nil {
			log.Printf("scan: ffprobe failed for %s: %v", path, err)
			return nil
		}

		media := model.Media{
			Path:     relPath,
			Width:    width,
			Height:   height,
			Filesize: info.Size(),
			Mdate:    info.ModTime().Unix(),
			Duration: duration,
			IsVid:    isVid,
		}
		if err := s.InsertMedia(media); err != nil {
			log.Printf("scan: error inserting media %s: %v", relPath, err)
		}
		return nil
	})
	if err != nil {
		log.Printf("scan: walk failed: %v", err)
	}
}

type ffprobeStream struct {
	CodecType    string            `json:"codec_type"`
	Width        int               `json:"width"`
	Height       int               `json:"height"`
	Tags         map[string]string `json:"tags"`
	SideDataList []struct {
		Rotation float64 `json:"rotation"`
	} `json:"side_data_list"`
}

type ffprobeOutput struct {
	Streams []ffprobeStream `json:"streams"`
	Format  struct {
		Duration string `json:"duration"`
	} `json:"format"`
}

// probe shells out to ffprobe for width/height (and duration, for videos),
// swapping width/height when the stream's rotation metadata is 90/270
// degrees so stored dimensions match the file's actual display orientation.
func probe(path string, isVid bool) (width, height, duration int, err error) {
	cmd := exec.Command("ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return 0, 0, 0, fmt.Errorf("ffprobe: %w", err)
	}

	return parseProbeOutput(out.Bytes(), isVid)
}

// parseProbeOutput contains all the logic for interpreting ffprobe's JSON
// output, kept separate from probe() so it can be unit-tested against canned
// JSON without shelling out to a real ffprobe binary.
func parseProbeOutput(data []byte, isVid bool) (width, height, duration int, err error) {
	var parsed ffprobeOutput
	if err := json.Unmarshal(data, &parsed); err != nil {
		return 0, 0, 0, fmt.Errorf("parsing ffprobe output: %w", err)
	}

	var stream *ffprobeStream
	for i := range parsed.Streams {
		if parsed.Streams[i].CodecType == "video" {
			stream = &parsed.Streams[i]
			break
		}
	}
	if stream == nil {
		return 0, 0, 0, fmt.Errorf("no video/image stream found")
	}

	width, height = stream.Width, stream.Height
	if rotationNeedsSwap(stream) {
		width, height = height, width
	}

	if isVid {
		if d, err := strconv.ParseFloat(parsed.Format.Duration, 64); err == nil {
			duration = int(math.Round(d))
		}
	}

	return width, height, duration, nil
}

func rotationNeedsSwap(stream *ffprobeStream) bool {
	rotation := 0.0
	if r, ok := stream.Tags["rotate"]; ok {
		if v, err := strconv.ParseFloat(r, 64); err == nil {
			rotation = v
		}
	}
	for _, sd := range stream.SideDataList {
		if sd.Rotation != 0 {
			rotation = sd.Rotation
		}
	}
	rotation = math.Mod(math.Abs(rotation), 360)
	return math.Abs(rotation-90) < 0.01 || math.Abs(rotation-270) < 0.01
}
