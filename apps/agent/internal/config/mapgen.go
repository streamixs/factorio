package config

import (
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

// RenderMapGenSettings renders spec into a map-gen-settings.json document.
// These settings only apply when a new map is generated. Unset typed fields
// keep the Factorio defaults.
func RenderMapGenSettings(spec *gamesv1alpha1.MapGenSettingsSpec) ([]byte, error) {
	overrides := map[string]any{}
	var raw *apiextensionsv1.JSON

	if spec != nil {
		raw = spec.Raw
		setFloat64(overrides, "terrain_segmentation", spec.TerrainSegmentation)
		setFloat64(overrides, "water", spec.Water)
		setInt32(overrides, "width", spec.Width)
		setInt32(overrides, "height", spec.Height)
		setFloat64(overrides, "starting_area", spec.StartingArea)
		setBool(overrides, "peaceful_mode", spec.PeacefulMode)
		setInt64(overrides, "seed", spec.Seed)

		if spec.StartingPoints != nil {
			points := make([]map[string]any, 0, len(spec.StartingPoints))
			for _, point := range spec.StartingPoints {
				coordinates := map[string]any{}
				setFloat64(coordinates, "x", point.X)
				setFloat64(coordinates, "y", point.Y)
				points = append(points, coordinates)
			}
			overrides["starting_points"] = points
		}

		if spec.AutoplaceControls != nil {
			controls := make(map[string]any, len(spec.AutoplaceControls))
			for name, control := range spec.AutoplaceControls {
				values := map[string]any{}
				setFloat64(values, "frequency", control.Frequency)
				setFloat64(values, "size", control.Size)
				setFloat64(values, "richness", control.Richness)
				controls[name] = values
			}
			overrides["autoplace_controls"] = controls
		}

		if spec.CliffSettings != nil {
			cliffs := map[string]any{}
			setString(cliffs, "name", spec.CliffSettings.Name)
			setFloat64(cliffs, "cliff_elevation_0",
				spec.CliffSettings.CliffElevation0)
			setFloat64(cliffs, "cliff_elevation_interval",
				spec.CliffSettings.CliffElevationInterval)
			setFloat64(cliffs, "richness", spec.CliffSettings.Richness)
			if len(cliffs) > 0 {
				overrides["cliff_settings"] = cliffs
			}
		}
	}

	defaults, err := defaultSettings(MapGenSettingsFile)
	if err != nil {
		return nil, err
	}

	return render(defaults, overrides, raw)
}
