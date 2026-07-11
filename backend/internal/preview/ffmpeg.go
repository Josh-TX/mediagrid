package preview

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// GenerateThumbnail writes a webp thumbnail of srcPath to outPath, scaled to
// w x h. For videos (isVid), the frame at the middle of the video
// (durationSec/2) is used; for images, the image itself is scaled directly.
//
// Deliberately takes no context: task cancellation is cooperative and
// checked between items (see the tasks package), so an in-flight ffmpeg
// call is always allowed to finish rather than being killed mid-encode.
func GenerateThumbnail(srcPath, outPath string, isVid bool, durationSec, w, h, quality int) error {
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return err
	}

	args := []string{"-y"}
	if isVid {
		mid := float64(durationSec) / 2
		args = append(args, "-ss", fmt.Sprintf("%.3f", mid))
	}
	args = append(args, "-i", srcPath)
	if isVid {
		args = append(args, "-vframes", "1")
	}
	args = append(args, "-vf", fmt.Sprintf("scale=%d:%d", w, h), "-quality", fmt.Sprintf("%d", quality), outPath)

	cmd := exec.Command("ffmpeg", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg thumbnail: %w: %s", err, out)
	}
	return nil
}

// GenerateHighlight writes an mp4 highlight of srcPath to outPath: a single
// section durationSec long starting at startSec, scaled to w x h, with audio
// stripped (highlights are silent). ffmpegArgs is a space-separated string
// of extra encoder args (e.g. "-c:v libx264 -crf 25 -preset fast").
//
// Deliberately takes no context; see GenerateThumbnail.
func GenerateHighlight(srcPath, outPath string, startSec, durationSec float64, w, h int, ffmpegArgs string) error {
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return err
	}

	args := []string{
		"-y",
		"-ss", fmt.Sprintf("%.3f", startSec),
		"-t", fmt.Sprintf("%.3f", durationSec),
		"-i", srcPath,
		"-vf", fmt.Sprintf("scale=%d:%d", w, h),
		"-an",
	}
	if trimmed := strings.TrimSpace(ffmpegArgs); trimmed != "" {
		args = append(args, strings.Fields(trimmed)...)
	}
	args = append(args, outPath)

	cmd := exec.Command("ffmpeg", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg highlight: %w: %s", err, out)
	}
	return nil
}
