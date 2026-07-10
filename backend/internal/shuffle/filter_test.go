package shuffle

import (
	"testing"

	"mediagrid/internal/model"
)

func img(path string, w, h int) model.Media {
	return model.Media{Path: path, Width: w, Height: h, IsVid: false}
}

func vid(path string, w, h, duration int) model.Media {
	return model.Media{Path: path, Width: w, Height: h, IsVid: true, Duration: duration}
}

func paths(media []model.Media) []string {
	out := make([]string, len(media))
	for i, m := range media {
		out[i] = m.Path
	}
	return out
}

func assertPaths(t *testing.T, got []model.Media, want []string) {
	t.Helper()
	gotPaths := paths(got)
	if len(gotPaths) != len(want) {
		t.Fatalf("got %v, want %v", gotPaths, want)
	}
	for i := range want {
		if gotPaths[i] != want[i] {
			t.Fatalf("got %v, want %v", gotPaths, want)
		}
	}
}

func TestFilter_SimpleFilterRequiresAllTermsAND(t *testing.T) {
	media := []model.Media{
		img("vacation/beach/sunset.jpg", 16, 9),
		img("vacation/mountains/sunset.jpg", 16, 9),
		img("work/beach.jpg", 16, 9),
	}
	got := Filter(media, Params{F: "beach sunset"})
	assertPaths(t, got, []string{"vacation/beach/sunset.jpg"})
}

func TestFilter_SimpleFilterCaseInsensitive(t *testing.T) {
	media := []model.Media{img("Vacation/BEACH.jpg", 16, 9)}
	got := Filter(media, Params{F: "vacation beach"})
	assertPaths(t, got, []string{"Vacation/BEACH.jpg"})
}

func TestFilter_WhitelistIsOR(t *testing.T) {
	media := []model.Media{
		img("cats.jpg", 16, 9),
		img("dogs.jpg", 16, 9),
		img("birds.jpg", 16, 9),
	}
	got := Filter(media, Params{Whitelist: []string{"cat", "dog"}})
	assertPaths(t, got, []string{"cats.jpg", "dogs.jpg"})
}

func TestFilter_BlacklistExcludesAnyMatch(t *testing.T) {
	media := []model.Media{
		img("cats.jpg", 16, 9),
		img("dogs.jpg", 16, 9),
		img("birds.jpg", 16, 9),
	}
	got := Filter(media, Params{Blacklist: []string{"cat", "dog"}})
	assertPaths(t, got, []string{"birds.jpg"})
}

func TestFilter_ExcludeVidsAndImages(t *testing.T) {
	media := []model.Media{
		img("photo.jpg", 16, 9),
		vid("clip.mp4", 16, 9, 5),
	}

	onlyImages := Filter(media, Params{ExVids: true})
	assertPaths(t, onlyImages, []string{"photo.jpg"})

	onlyVideos := Filter(media, Params{ExImgs: true})
	assertPaths(t, onlyVideos, []string{"clip.mp4"})
}

func TestFilter_PortraitLandscapeAspectRatio(t *testing.T) {
	portrait := img("portrait.jpg", 9, 16)   // aspect < 1
	landscape := img("landscape.jpg", 16, 9) // aspect > 1
	square := img("square.jpg", 10, 10)      // aspect == 1
	media := []model.Media{portrait, landscape, square}

	// exPort excludes aspect <= 1 (portrait and square)
	got := Filter(media, Params{ExPort: true})
	assertPaths(t, got, []string{"landscape.jpg"})

	// exLand excludes aspect >= 1 (landscape and square)
	got = Filter(media, Params{ExLand: true})
	assertPaths(t, got, []string{"portrait.jpg"})
}

func TestFilter_DurationOnlyAffectsVideos(t *testing.T) {
	media := []model.Media{
		img("photo.jpg", 16, 9), // no duration, must be unaffected by minDur/maxDur
		vid("short.mp4", 16, 9, 2),
		vid("long.mp4", 16, 9, 20),
	}
	got := Filter(media, Params{MinDur: 5, MaxDur: 30})
	assertPaths(t, got, []string{"photo.jpg", "long.mp4"})
}

func TestFilter_BasePathIsPrefixMatchCaseInsensitive(t *testing.T) {
	media := []model.Media{
		img("Vacation/beach.jpg", 16, 9),
		img("work/beach.jpg", 16, 9),
	}
	got := Filter(media, Params{BasePath: "vacation"})
	assertPaths(t, got, []string{"Vacation/beach.jpg"})
}

func TestFilter_AllGatesANDTogether(t *testing.T) {
	media := []model.Media{
		vid("vacation/clip.mp4", 16, 9, 5),
		vid("work/clip.mp4", 16, 9, 5),
		img("vacation/photo.jpg", 16, 9),
	}
	got := Filter(media, Params{BasePath: "vacation", ExImgs: true})
	assertPaths(t, got, []string{"vacation/clip.mp4"})
}
