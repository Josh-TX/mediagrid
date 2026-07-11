package scan

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"mediagrid/internal/model"
	"mediagrid/internal/preview"
	"mediagrid/internal/store"
)

var imageExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
}

var videoExts = map[string]bool{
	".mp4": true, ".webm": true, ".mov": true, ".mkv": true, ".avi": true, ".m4v": true,
}

// walkCandidates walks mediaRoot, skipping dotfiles/dirs and symlinks, and
// invokes fn for every file with a recognized image/video extension. It's
// shared by the counting pass and the working pass in Run so both apply
// identical skip/filter logic. When ctx is non-nil and gets cancelled, the
// walk stops early (via filepath.SkipAll) without error.
func walkCandidates(ctx context.Context, mediaRoot string, fn func(relPath string, isVid bool) error) error {
	return filepath.WalkDir(mediaRoot, func(path string, d fs.DirEntry, err error) error {
		if ctx != nil && ctx.Err() != nil {
			return filepath.SkipAll
		}
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

		return fn(relPath, isVid)
	})
}

// Run walks mediaRoot and records any media files not already present in
// the store. It first makes a counting pass (to know the total for
// progress reporting) and then a working pass that actually probes and
// inserts new files, calling progress(processed, total) after each one.
// progress may be nil. ctx cancellation stops the working pass between
// files (whatever ffprobe call is in flight is allowed to finish).
func Run(ctx context.Context, s *store.Store, mediaRoot string, progress func(processed, total int)) error {
	total := 0
	if err := walkCandidates(nil, mediaRoot, func(relPath string, isVid bool) error {
		exists, err := s.MediaExists(relPath)
		if err != nil {
			log.Printf("scan: error checking existing media %s: %v", relPath, err)
			return nil
		}
		if !exists {
			total++
		}
		return nil
	}); err != nil {
		return fmt.Errorf("scan: counting pass failed: %w", err)
	}
	if progress != nil {
		progress(0, total)
	}

	processed := 0
	err := walkCandidates(ctx, mediaRoot, func(relPath string, isVid bool) error {
		exists, err := s.MediaExists(relPath)
		if err != nil {
			log.Printf("scan: error checking existing media %s: %v", relPath, err)
			return nil
		}
		if exists {
			return nil
		}

		fullPath := filepath.Join(mediaRoot, relPath)
		info, err := os.Stat(fullPath)
		if err != nil {
			log.Printf("scan: error stating %s: %v", fullPath, err)
			return nil
		}

		width, height, duration, err := probe(fullPath, isVid)
		if err != nil {
			log.Printf("scan: ffprobe failed for %s: %v", fullPath, err)
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

		processed++
		if progress != nil {
			progress(processed, total)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("scan: walk failed: %w", err)
	}
	return nil
}

// Clean removes media rows whose underlying file no longer exists under
// mediaRoot, along with any thumbnail/highlight preview files generated for
// them. It does not otherwise sweep PREVIEW_ROOT for orphans.
func Clean(s *store.Store, mediaRoot, previewRoot string) error {
	all, err := s.ListAllMedia()
	if err != nil {
		return fmt.Errorf("clean: listing media: %w", err)
	}

	for _, m := range all {
		fullPath := filepath.Join(mediaRoot, m.Path)
		if _, err := os.Stat(fullPath); err == nil {
			continue
		} else if !os.IsNotExist(err) {
			log.Printf("clean: error stating %s: %v", fullPath, err)
			continue
		}

		if err := s.DeleteMedia(m.Path); err != nil {
			log.Printf("clean: error deleting media %s: %v", m.Path, err)
			continue
		}
		os.Remove(preview.ThumbnailPath(previewRoot, m.Path))
		os.Remove(preview.HighlightPath(previewRoot, m.Path))
	}
	return nil
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
