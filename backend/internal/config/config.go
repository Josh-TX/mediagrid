package config

import (
	"flag"
	"fmt"
	"io"
	"path/filepath"
)

type Config struct {
	MediaRoot   string
	DataRoot    string
	PreviewRoot string
	DBPath      string
	Port        string
}

const usageText = `MediaGrid - a mobile-first local media gallery and player.

Usage:
  mediagrid --media <path> --data <path> [flags]

Required:
  -m, --media string   Path to the media root directory to scan.
                        Env: MEDIA_ROOT
  -d, --data  string   Path to the data directory. Holds the database
                        (mediagrid.db), thumbnails/, and highlights/.
                        Env: DATA_ROOT

Optional:
  -p, --port  string   Port to listen on. (default "8080")
                        Env: PORT
  -h, --help            Show this help message.

Flags take precedence over the equivalent environment variable.

Examples:
  mediagrid --media /mnt/media --data /var/lib/mediagrid
  mediagrid -m /mnt/media -d /var/lib/mediagrid -p 9000
  MEDIA_ROOT=/mnt/media DATA_ROOT=/var/lib/mediagrid mediagrid
`

// EnvLookup abstracts os.LookupEnv so tests can supply a fake environment.
type EnvLookup func(key string) (string, bool)

// Load parses args (typically os.Args[1:]) into a Config, falling back to
// environment variables via lookupEnv when a flag isn't set. output is where
// the help/usage text is written (typically os.Stderr).
func Load(args []string, lookupEnv EnvLookup, output io.Writer) (Config, error) {
	fs := flag.NewFlagSet("mediagrid", flag.ContinueOnError)
	fs.SetOutput(output)
	fs.Usage = func() { fmt.Fprint(output, usageText) }

	var media, data, port string
	fs.StringVar(&media, "media", "", "")
	fs.StringVar(&media, "m", "", "")
	fs.StringVar(&data, "data", "", "")
	fs.StringVar(&data, "d", "", "")
	fs.StringVar(&port, "port", "", "")
	fs.StringVar(&port, "p", "", "")

	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}

	if media == "" {
		media, _ = lookupEnv("MEDIA_ROOT")
	}
	if data == "" {
		data, _ = lookupEnv("DATA_ROOT")
	}
	if port == "" {
		port, _ = lookupEnv("PORT")
	}
	if port == "" {
		port = "8080"
	}

	if media == "" {
		fs.Usage()
		return Config{}, fmt.Errorf("media root is required (--media/-m flag or MEDIA_ROOT env var)")
	}
	if data == "" {
		fs.Usage()
		return Config{}, fmt.Errorf("data root is required (--data/-d flag or DATA_ROOT env var)")
	}

	return Config{
		MediaRoot:   media,
		DataRoot:    data,
		PreviewRoot: data,
		DBPath:      filepath.Join(data, "mediagrid.db"),
		Port:        port,
	}, nil
}
