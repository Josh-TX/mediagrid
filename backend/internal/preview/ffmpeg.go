package preview

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// splitFfmpegArgs splits a space-separated extra-args string (e.g. "-c:v
// libx264 -crf 25 -preset fast") into individual exec.Command args.
func splitFfmpegArgs(ffmpegArgs string) []string {
	trimmed := strings.TrimSpace(ffmpegArgs)
	if trimmed == "" {
		return nil
	}
	return strings.Fields(trimmed)
}

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

// GenerateHighlight writes an mp4 highlight of srcPath to outPath: n
// segments of segmentDuration seconds each, sampled from n evenly-spaced
// buckets spanning the full mediaDuration (see HighlightSegmentStart),
// scaled to w x h, with audio stripped (highlights are silent), then
// concatenated together. ffmpegArgs is a space-separated string of extra
// encoder args (e.g. "-c:v libx264 -crf 25 -preset fast") applied to each
// segment's extraction; the final concat is a stream copy (no re-encode).
//
// Segments are extracted sequentially, and the first ffmpeg failure aborts
// the whole operation (no partial/best-effort output).
//
// Deliberately takes no context; see GenerateThumbnail.
func GenerateHighlight(srcPath, outPath string, mediaDuration float64, n int, segmentDuration float64, w, h int, ffmpegArgs string) error {
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return err
	}

	tempDir, err := os.MkdirTemp("", "mediagrid-highlight-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)

	extraArgs := splitFfmpegArgs(ffmpegArgs)
	segmentFiles := make([]string, n)

	for i := 0; i < n; i++ {
		start := HighlightSegmentStart(mediaDuration, n, i, segmentDuration)
		segmentFile := filepath.Join(tempDir, fmt.Sprintf("seg_%d.mp4", i))
		segmentFiles[i] = segmentFile

		args := []string{
			"-y",
			"-ss", fmt.Sprintf("%.3f", start),
			"-t", fmt.Sprintf("%.3f", segmentDuration),
			"-i", srcPath,
			"-vf", fmt.Sprintf("scale=%d:%d", w, h),
			"-an",
		}
		args = append(args, extraArgs...)
		args = append(args, segmentFile)

		cmd := exec.Command("ffmpeg", args...)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("ffmpeg highlight segment %d: %w: %s", i, err, out)
		}
	}

	concatFile := filepath.Join(tempDir, "concat.txt")
	var concatList strings.Builder
	for _, f := range segmentFiles {
		fmt.Fprintf(&concatList, "file '%s'\n", f)
	}
	if err := os.WriteFile(concatFile, []byte(concatList.String()), 0o644); err != nil {
		return err
	}

	cmd := exec.Command("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", "-an", outPath)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg highlight concat: %w: %s", err, out)
	}
	return nil
}
