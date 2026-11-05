package config

import (
	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

// RenderMapGenSettings renders spec into a map-gen-settings.json document.
// These settings only apply when a new map is generated.
func RenderMapGenSettings(spec *gamesv1alpha1.MapGenSettingsSpec) ([]byte, error) {
	settings := map[string]any{}
	if spec == nil {
		return render(settings, nil)
	}

	setMapGenSize(settings, "terrain_segmentation", spec.TerrainSegmentation)
	setMapGenSize(settings, "water", spec.Water)
	setInt32(settings, "width", spec.Width)
	setInt32(settings, "height", spec.Height)
	setMapGenSize(settings, "starting_area", spec.StartingArea)
	setBool(settings, "peaceful_mode", spec.PeacefulMode)
	setInt64(settings, "seed", spec.Seed)

	if spec.StartingPoints != nil {
		points := make([]map[string]any, 0, len(spec.StartingPoints))
		for _, point := range spec.StartingPoints {
			coordinates := map[string]any{}
			setFloat64(coordinates, "x", point.X)
			setFloat64(coordinates, "y", point.Y)
			points = append(points, coordinates)
		}
		settings["starting_points"] = points
	}

	if spec.AutoplaceControls != nil {
		controls := make(map[string]map[string]any, len(spec.AutoplaceControls))
		for name, control := range spec.AutoplaceControls {
			values := map[string]any{}
			setMapGenSize(values, "frequency", control.Frequency)
			setMapGenSize(values, "size", control.Size)
			setMapGenSize(values, "richness", control.Richness)
			controls[name] = values
		}
		settings["autoplace_controls"] = controls
	}

	if spec.CliffSettings != nil {
		cliffs := map[string]any{}
		setString(cliffs, "name", spec.CliffSettings.Name)
		setFloat64(cliffs, "cliff_elevation_0", spec.CliffSettings.CliffElevation0)
		setFloat64(cliffs, "cliff_elevation_interval",
			spec.CliffSettings.CliffElevationInterval)
		setFloat64(cliffs, "richness", spec.CliffSettings.Richness)
		if len(cliffs) > 0 {
			settings["cliff_settings"] = cliffs
		}
	}

	return render(settings, spec.Raw)
}
