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

// MapSettingsSpec defines the settings rendered into Factorio's
// map-settings.json file.
type MapSettingsSpec struct {

	// pollution defines how pollution spreads and affects the map.
	// Maps to pollution.
	// +optional
	Pollution *PollutionSpec `json:"pollution,omitempty"`

	// enemyEvolution defines how enemies evolve over time.
	// Maps to enemy_evolution.
	// +optional
	EnemyEvolution *EnemyEvolutionSpec `json:"enemyEvolution,omitempty"`

	// enemyExpansion defines how enemies expand their bases.
	// Maps to enemy_expansion.
	// +optional
	EnemyExpansion *EnemyExpansionSpec `json:"enemyExpansion,omitempty"`

	// difficultySettings defines recipe and technology costs.
	// Maps to difficulty_settings.
	// +optional
	DifficultySettings *DifficultySettingsSpec `json:"difficultySettings,omitempty"`

	// maxFailedBehaviorCount is the number of consecutive failed behaviors
	// before a unit is removed. Maps to max_failed_behavior_count.
	// +optional
	// +kubebuilder:validation:Minimum=0
	MaxFailedBehaviorCount *int32 `json:"maxFailedBehaviorCount,omitempty"`

	// raw contains additional map-settings.json keys that are not exposed as
	// typed fields, such as unit_group, steering, path_finder or asteroids.
	// A key set both here and through a typed field is rejected to avoid
	// ambiguity.
	// +optional
	// +kubebuilder:pruning:PreserveUnknownFields
	Raw *apiextensionsv1.JSON `json:"raw,omitempty"`
}

// PollutionSpec defines how pollution spreads and affects the map.
type PollutionSpec struct {

	// enabled enables pollution. Maps to enabled.
	// +optional
	Enabled *bool `json:"enabled,omitempty"`

	// diffusionRatio is the fraction of pollution that diffuses to
	// neighbouring chunks every tick. Maps to diffusion_ratio.
	// +optional
	DiffusionRatio *float64 `json:"diffusionRatio,omitempty"`

	// minToDiffuse is the pollution amount below which no diffusion happens.
	// Maps to min_to_diffuse.
	// +optional
	MinToDiffuse *float64 `json:"minToDiffuse,omitempty"`

	// ageing is the fraction of pollution removed every tick.
	// Maps to ageing.
	// +optional
	Ageing *float64 `json:"ageing,omitempty"`

	// expectedMaxPerChunk is the pollution amount used to normalise the
	// pollution overlay. Maps to expected_max_per_chunk.
	// +optional
	ExpectedMaxPerChunk *float64 `json:"expectedMaxPerChunk,omitempty"`

	// minToShowPerChunk is the pollution amount below which the overlay is
	// hidden. Maps to min_to_show_per_chunk.
	// +optional
	MinToShowPerChunk *float64 `json:"minToShowPerChunk,omitempty"`

	// minPollutionToDamageTrees is the pollution amount that starts damaging
	// trees. Maps to min_pollution_to_damage_trees.
	// +optional
	MinPollutionToDamageTrees *float64 `json:"minPollutionToDamageTrees,omitempty"`

	// pollutionWithMaxForestDamage is the pollution amount that deals maximum
	// forest damage. Maps to pollution_with_max_forest_damage.
	// +optional
	PollutionWithMaxForestDamage *float64 `json:"pollutionWithMaxForestDamage,omitempty"`

	// pollutionPerTreeDamage is the pollution absorbed per tree damage.
	// Maps to pollution_per_tree_damage.
	// +optional
	PollutionPerTreeDamage *float64 `json:"pollutionPerTreeDamage,omitempty"`

	// pollutionRestoredPerTreeDamage is the pollution restored per tree
	// damage. Maps to pollution_restored_per_tree_damage.
	// +optional
	PollutionRestoredPerTreeDamage *float64 `json:"pollutionRestoredPerTreeDamage,omitempty"`

	// maxPollutionToRestoreTrees is the maximum pollution that can be
	// restored by trees. Maps to max_pollution_to_restore_trees.
	// +optional
	MaxPollutionToRestoreTrees *float64 `json:"maxPollutionToRestoreTrees,omitempty"`

	// enemyAttackPollutionConsumptionModifier scales the pollution consumed
	// by enemy attacks. Maps to
	// enemy_attack_pollution_consumption_modifier.
	// +optional
	EnemyAttackPollutionConsumptionModifier *float64 `json:"enemyAttackPollutionConsumptionModifier,omitempty"`
}

// EnemyEvolutionSpec defines how enemies evolve over time.
type EnemyEvolutionSpec struct {

	// enabled enables enemy evolution. Maps to enabled.
	// +optional
	Enabled *bool `json:"enabled,omitempty"`

	// timeFactor is the evolution gained per tick. Maps to time_factor.
	// +optional
	TimeFactor *float64 `json:"timeFactor,omitempty"`

	// destroyFactor is the evolution gained per destroyed entity.
	// Maps to destroy_factor.
	// +optional
	DestroyFactor *float64 `json:"destroyFactor,omitempty"`

	// pollutionFactor is the evolution gained per unit of pollution.
	// Maps to pollution_factor.
	// +optional
	PollutionFactor *float64 `json:"pollutionFactor,omitempty"`
}

// EnemyExpansionSpec defines how enemies expand their bases.
type EnemyExpansionSpec struct {

	// enabled enables enemy expansion. Maps to enabled.
	// +optional
	Enabled *bool `json:"enabled,omitempty"`

	// maxExpansionDistance is the maximum distance in chunks a group can
	// travel. Maps to max_expansion_distance.
	// +optional
	// +kubebuilder:validation:Minimum=0
	MaxExpansionDistance *int32 `json:"maxExpansionDistance,omitempty"`

	// friendlyBaseInfluenceRadius is the radius in chunks around friendly
	// bases where enemies do not expand. Maps to
	// friendly_base_influence_radius.
	// +optional
	// +kubebuilder:validation:Minimum=0
	FriendlyBaseInfluenceRadius *int32 `json:"friendlyBaseInfluenceRadius,omitempty"`

	// enemyBuildingInfluenceRadius is the radius in chunks around enemy
	// buildings that counts as a base. Maps to
	// enemy_building_influence_radius.
	// +optional
	// +kubebuilder:validation:Minimum=0
	EnemyBuildingInfluenceRadius *int32 `json:"enemyBuildingInfluenceRadius,omitempty"`

	// buildingCoefficient weights enemy buildings when choosing an expansion
	// target. Maps to building_coefficient.
	// +optional
	BuildingCoefficient *float64 `json:"buildingCoefficient,omitempty"`

	// otherBaseCoefficient weights other bases when choosing an expansion
	// target. Maps to other_base_coefficient.
	// +optional
	OtherBaseCoefficient *float64 `json:"otherBaseCoefficient,omitempty"`

	// neighbouringChunkCoefficient weights neighbouring chunks when choosing
	// an expansion target. Maps to neighbouring_chunk_coefficient.
	// +optional
	NeighbouringChunkCoefficient *float64 `json:"neighbouringChunkCoefficient,omitempty"`

	// neighbouringBaseChunkCoefficient weights neighbouring base chunks when
	// choosing an expansion target. Maps to
	// neighbouring_base_chunk_coefficient.
	// +optional
	NeighbouringBaseChunkCoefficient *float64 `json:"neighbouringBaseChunkCoefficient,omitempty"`

	// maxCollidingTilesCoefficient is the maximum fraction of colliding tiles
	// an expansion group tolerates. Maps to
	// max_colliding_tiles_coefficient.
	// +optional
	MaxCollidingTilesCoefficient *float64 `json:"maxCollidingTilesCoefficient,omitempty"`

	// settlerGroupMinSize is the minimum size of an expansion group.
	// Maps to settler_group_min_size.
	// +optional
	// +kubebuilder:validation:Minimum=0
	SettlerGroupMinSize *int32 `json:"settlerGroupMinSize,omitempty"`

	// settlerGroupMaxSize is the maximum size of an expansion group.
	// Maps to settler_group_max_size.
	// +optional
	// +kubebuilder:validation:Minimum=0
	SettlerGroupMaxSize *int32 `json:"settlerGroupMaxSize,omitempty"`

	// minExpansionCooldown is the minimum delay in ticks between expansions.
	// Maps to min_expansion_cooldown.
	// +optional
	// +kubebuilder:validation:Minimum=0
	MinExpansionCooldown *int32 `json:"minExpansionCooldown,omitempty"`

	// maxExpansionCooldown is the maximum delay in ticks between expansions.
	// Maps to max_expansion_cooldown.
	// +optional
	// +kubebuilder:validation:Minimum=0
	MaxExpansionCooldown *int32 `json:"maxExpansionCooldown,omitempty"`
}

// DifficultySettingsSpec defines recipe and technology costs.
type DifficultySettingsSpec struct {

	// recipeDifficulty selects the recipe difficulty: 0 for normal, 1 for
	// expensive. Maps to recipe_difficulty.
	// +optional
	// +kubebuilder:validation:Enum=0;1
	RecipeDifficulty *int32 `json:"recipeDifficulty,omitempty"`

	// technologyDifficulty selects the technology difficulty: 0 for normal,
	// 1 for expensive. Maps to technology_difficulty.
	// +optional
	// +kubebuilder:validation:Enum=0;1
	TechnologyDifficulty *int32 `json:"technologyDifficulty,omitempty"`

	// technologyPriceMultiplier scales technology costs.
	// Maps to technology_price_multiplier.
	// +optional
	TechnologyPriceMultiplier *float64 `json:"technologyPriceMultiplier,omitempty"`

	// spoilTimeModifier scales spoilage times. Maps to spoil_time_modifier.
	// +optional
	SpoilTimeModifier *float64 `json:"spoilTimeModifier,omitempty"`
}
