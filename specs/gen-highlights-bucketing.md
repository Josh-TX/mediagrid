# Gen Highlights Bucketing

## Description

The Go rewrite's Gen Highlights task (`backend/internal/tasks/gen_highlights_task.go`, `backend/internal/preview/ffmpeg.go`, `backend/internal/preview/segments.go`) currently has an incomplete highlight-generation step left over from other in-progress changes. I want to replace it with a proper multi-segment, evenly-spaced-bucket implementation, closely mirroring how the old TypeScript implementation (`backend/src/gen-highlights.ts` on `main`, pre-rewrite) worked, adapted to the new Go settings shape (`SegmentCount`, `SegmentDuration`, `MaxProportion` — there's no longer a direct `highlightDuration` input).

### Current (incomplete) state

- `preview.CalcHighlightSegments(videoDuration, segmentCount, segmentDuration, maxProportion)` already exists and is correct: it returns `N` (≤ `segmentCount`, minimum 1), the actual number of segments a given video supports under the max-proportion rule (`videoDuration >= N * segmentDuration * maxProportion`), or `ok=false` if the video doesn't meet the threshold even for one segment (such videos are skipped entirely and don't count toward the task's `Total`).
- `runGenHighlights` already computes `job.segments = N` per video via `CalcHighlightSegments`, but then discards the bucket structure: it computes a single `highlightDuration = N * segmentDuration`, centers one contiguous window in the video (`start = (media.Duration - highlightDuration) / 2`), and calls `GenerateHighlight` once for a single contiguous clip. This centering logic is temporary scaffolding and must be deleted entirely.
- `preview.GenerateHighlight` is currently a single-shot ffmpeg call (`-ss start -t duration`, scale, `-an`) — it has no per-segment extraction, no temp dir, no concat step.

### Desired behavior

Reintroduce the old bucket-and-concat approach, adapted so that the bucket count is `N` (the per-video capped segment count from `CalcHighlightSegments`) rather than a fixed `segmentCount`, and buckets always span the video's **entire** duration:

- For a given video with `N` segments and `mediaDuration`, divide the full duration into `N` evenly-spaced buckets: `bucketWidth = mediaDuration / N`, `bucketStart(i) = i * bucketWidth` for `i in [0, N)`.
- Unlike the old code (which used the bucket's midpoint as the segment's *start* point), the segment should be **centered** on the bucket's midpoint: `segmentStart = bucketStart + bucketWidth/2 - segmentDuration/2`.
- Clamp `segmentStart` to `[0, mediaDuration - segmentDuration]` as a safety net, in case `maxProportion` is misconfigured below 1 (the frontend enforces `min="1"` on this field, but the backend doesn't currently validate it, and an unclamped centered segment could run past the video's start/end if a bucket is narrower than `segmentDuration`).
- Extract each segment to its own temp file: full ffmpeg encode with the configured `ffmpegArgs`, scaled to the target `w`/`h`, audio stripped (`-an`) — same as the old code's per-segment extraction.
- Once all `N` segments are extracted, concatenate them via ffmpeg's concat demuxer with `-c copy -an` (stream copy, no re-encode) into the final output path. This applies uniformly even when `N == 1` — no special-casing to skip the concat step for a single segment, for simplicity.
- If any single segment's ffmpeg extraction fails, abort immediately (fail fast) — don't attempt the remaining segments or the concat step. This differs from the old TS code (which logged and swallowed per-segment ffmpeg errors and kept looping); the new Go version instead returns an error up to the task loop, which already handles it via `IncFailed`.
- Segments are extracted sequentially (one ffmpeg call at a time), not concurrently — matches the old code's behavior and keeps ffmpeg resource usage predictable.
- Temp file management uses `os.MkdirTemp` + a single `defer os.RemoveAll(tempDir)`, rather than the old code's manual per-file `unlink` + `rmdir` in a `finally` block — simpler and more idiomatic Go.

### Where the logic lives

`preview.GenerateHighlight`'s signature is rewritten to own the entire bucket/extract/concat pipeline internally (rather than moving this loop into the task runner, which is how the old TS code structured it). This keeps the `preview` package symmetrical with `GenerateThumbnail` — one call does the whole job. New shape:

```go
func GenerateHighlight(srcPath, outPath string, mediaDuration float64, n int, segmentDuration float64, w, h int, ffmpegArgs string) error
```

`gen_highlights_task.go`'s per-video loop is simplified accordingly: delete the `highlightDuration`/`start` centering computation, and pass `media.Duration`, `job.segments` (N), and `settings.SegmentDuration` straight through to `GenerateHighlight`, alongside the already-computed `w`, `h` (via `preview.TargetDimensions`, unchanged) and `settings.FfmpegArgs`.

### Unrelated / unchanged

- `CalcHighlightSegments` itself is correct as-is and needs no changes.
- `preview.TargetDimensions` (shared with thumbnail generation) is unchanged — highlights keep using explicit `scale=w:h` (not aspect-preserving `-2` shorthand like the old TS code), consistent with the existing convention in this codebase.
- `HighlightPath`, the override-skip check, and the outer filter/skip logic in `runGenHighlights` are unchanged.

## Out of Scope

- Validating `maxProportion >= 1` on the backend (the clamp on `segmentStart` is the only safety net; no upfront rejection of bad settings).
- Concurrent/parallel segment extraction.
- Any change to `CalcHighlightSegments`'s bucket-count/threshold logic.
