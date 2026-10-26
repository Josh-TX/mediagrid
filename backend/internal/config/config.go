package config

import (
	"path/filepath"

	"github.com/alecthomas/kong"
)

type Config struct {
	MediaRoot string           `name:"media" short:"m" env:"MEDIAGRID_MEDIA" required:"" type:"path" help:"Media root directory to scan."`
	DataRoot  string           `name:"data" short:"d" env:"MEDIAGRID_DATA" required:"" type:"path" help:"Data directory. Holds the database (mediagrid.db), thumbnails/, and highlights/."`
	Port      string           `short:"p" env:"MEDIAGRID_PORT" default:"8080" help:"Port to listen on."`
	Version   kong.VersionFlag `short:"v" help:"Print version and exit."`

	// Derived from DataRoot; not CLI flags.
	PreviewRoot string `kong:"-"`
	DBPath      string `kong:"-"`
}

// Load parses args (typically os.Args[1:]); flags override env vars, which override defaults.
func Load(args []string, version string, opts ...kong.Option) (Config, error) {
	var cfg Config
	opts = append([]kong.Option{
		kong.Name("mediagrid"),
		kong.Description("A mobile-first local media gallery and player."),
		kong.Vars{"version": version},
		kong.UsageOnError(),
	}, opts...)
	k, err := kong.New(&cfg, opts...)
	if err != nil {
		return cfg, err
	}
	if _, err := k.Parse(args); err != nil {
		return cfg, err
	}
	cfg.PreviewRoot = cfg.DataRoot
	cfg.DBPath = filepath.Join(cfg.DataRoot, "mediagrid.db")
	return cfg, nil
}
