/*
Copyright 2026.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package v1alpha1

import (
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
)

// MapGenSettingsSpec defines the settings rendered into Factorio's
// map-gen-settings.json file. These settings are only used when a new map is
// generated; changing them has no effect on an existing save.
type MapGenSettingsSpec struct {

	// terrainSegmentation controls how fragmented the terrain is.
	// Maps to terrain_segmentation.
	// +optional
	TerrainSegmentation *MapGenSize `json:"terrainSegmentation,omitempty"`

	// water controls the amount of water on the map. Maps to water.
	// +optional
	Water *MapGenSize `json:"water,omitempty"`

	// width is the map width in tiles. A value of 0 means an infinite map.
	// Maps to width.
	// +optional
	// +kubebuilder:validation:Minimum=0
	Width *int32 `json:"width,omitempty"`

	// height is the map height in tiles. A value of 0 means an infinite map.
	// Maps to height.
	// +optional
	// +kubebuilder:validation:Minimum=0
	Height *int32 `json:"height,omitempty"`

	// startingArea controls the size of the area cleared around the starting
	// positions. Maps to starting_area.
	// +optional
	StartingArea *MapGenSize `json:"startingArea,omitempty"`

	// peacefulMode prevents enemies from attacking unless provoked.
	// Maps to peaceful_mode.
	// +optional
	PeacefulMode *bool `json:"peacefulMode,omitempty"`

	// seed is the map generation seed. When omitted, a random seed is used.
	// Maps to seed.
	// +optional
	// +kubebuilder:validation:Minimum=0
	// +kubebuilder:validation:Maximum=4294967295
	Seed *int64 `json:"seed,omitempty"`

	// startingPoints are the positions where players start.
	// Maps to starting_points.
	// +optional
	StartingPoints []MapPosition `json:"startingPoints,omitempty"`

	// autoplaceControls controls the frequency, size and richness of
	// resources and enemy bases. Keys are resource names such as "coal",
	// "iron-ore" or "enemy-base". Maps to autoplace_controls.
	// +optional
	AutoplaceControls map[string]AutoplaceControlSpec `json:"autoplaceControls,omitempty"`

	// cliffSettings controls cliff generation. Maps to cliff_settings.
	// +optional
	CliffSettings *CliffSettingsSpec `json:"cliffSettings,omitempty"`

	// raw contains additional map-gen-settings.json keys that are not exposed
	// as typed fields, such as property_expression_names. A key set both here
	// and through a typed field is rejected to avoid ambiguity.
	// +optional
	// +kubebuilder:pruning:PreserveUnknownFields
	Raw *apiextensionsv1.JSON `json:"raw,omitempty"`
}

// MapGenSize is a map generation slider value.
// +kubebuilder:validation:Enum=none;very-low;low;normal;high;very-high
type MapGenSize string

const (
	// MapGenSizeNone disables the feature.
	MapGenSizeNone MapGenSize = "none"

	// MapGenSizeVeryLow sets the slider to its lowest non-zero value.
	MapGenSizeVeryLow MapGenSize = "very-low"

	// MapGenSizeLow sets the slider below normal.
	MapGenSizeLow MapGenSize = "low"

	// MapGenSizeNormal sets the default slider value.
	MapGenSizeNormal MapGenSize = "normal"

	// MapGenSizeHigh sets the slider above normal.
	MapGenSizeHigh MapGenSize = "high"

	// MapGenSizeVeryHigh sets the slider to its highest value.
	MapGenSizeVeryHigh MapGenSize = "very-high"
)

// MapPosition is a position on the map.
type MapPosition struct {

	// x is the horizontal coordinate.
	// +optional
	X *float64 `json:"x,omitempty"`

	// y is the vertical coordinate.
	// +optional
	Y *float64 `json:"y,omitempty"`
}

// AutoplaceControlSpec controls the generation of one resource or enemy base
// type.
type AutoplaceControlSpec struct {

	// frequency controls how often the entity appears. Maps to frequency.
	// +optional
	Frequency *MapGenSize `json:"frequency,omitempty"`

	// size controls the size of the generated patches. Maps to size.
	// +optional
	Size *MapGenSize `json:"size,omitempty"`

	// richness controls how much resource each patch contains.
	// Maps to richness.
	// +optional
	Richness *MapGenSize `json:"richness,omitempty"`
}

// CliffSettingsSpec controls cliff generation.
type CliffSettingsSpec struct {

	// name is the cliff entity name. Maps to name.
	// +optional
	Name *string `json:"name,omitempty"`

	// cliffElevation0 is the elevation of the first cliff line.
	// Maps to cliff_elevation_0.
	// +optional
	CliffElevation0 *float64 `json:"cliffElevation0,omitempty"`

	// cliffElevationInterval is the elevation interval between cliff lines.
	// Maps to cliff_elevation_interval.
	// +optional
	CliffElevationInterval *float64 `json:"cliffElevationInterval,omitempty"`

	// richness controls how many cliffs are generated. Maps to richness.
	// +optional
	Richness *float64 `json:"richness,omitempty"`
}
