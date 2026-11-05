package config

import (
	"embed"
	"encoding/json"
	"fmt"
	"sync"
)

// The defaults are the 2.1.24 example files shipped with the Factorio image,
// with the _comment_* keys removed and a neutral server name. Factorio needs
// the complete property tree to accept a settings file.
//
//go:embed defaults/*.json
var defaultFiles embed.FS

var (
	defaultsOnce sync.Once
	defaults     map[string]map[string]any
	defaultsErr  error
)

func loadDefaults() error {
	defaultsOnce.Do(func() {
		defaults = make(map[string]map[string]any, 3)

		for _, name := range []string{
			ServerSettingsFile,
			MapGenSettingsFile,
			MapSettingsFile,
		} {
			data, err := defaultFiles.ReadFile("defaults/" + name)
			if err != nil {
				defaultsErr = fmt.Errorf("read default %s: %w", name, err)
				return
			}

			var settings map[string]any
			if err := json.Unmarshal(data, &settings); err != nil {
				defaultsErr = fmt.Errorf("parse default %s: %w", name, err)
				return
			}

			defaults[name] = settings
		}
	})

	return defaultsErr
}

func defaultSettings(name string) (map[string]any, error) {
	if err := loadDefaults(); err != nil {
		return nil, err
	}

	return defaults[name], nil
}
