package config

import (
	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

// RenderMapSettings renders spec into a map-settings.json document.
func RenderMapSettings(spec *gamesv1alpha1.MapSettingsSpec) ([]byte, error) {
	settings := map[string]any{}
	if spec == nil {
		return render(settings, nil)
	}

	if spec.Pollution != nil {
		pollution := map[string]any{}
		setBool(pollution, "enabled", spec.Pollution.Enabled)
		setFloat64(pollution, "diffusion_ratio", spec.Pollution.DiffusionRatio)
		setFloat64(pollution, "min_to_diffuse", spec.Pollution.MinToDiffuse)
		setFloat64(pollution, "ageing", spec.Pollution.Ageing)
		setFloat64(pollution, "expected_max_per_chunk",
			spec.Pollution.ExpectedMaxPerChunk)
		setFloat64(pollution, "min_to_show_per_chunk",
			spec.Pollution.MinToShowPerChunk)
		setFloat64(pollution, "min_pollution_to_damage_trees",
			spec.Pollution.MinPollutionToDamageTrees)
		setFloat64(pollution, "pollution_with_max_forest_damage",
			spec.Pollution.PollutionWithMaxForestDamage)
		setFloat64(pollution, "pollution_per_tree_damage",
			spec.Pollution.PollutionPerTreeDamage)
		setFloat64(pollution, "pollution_restored_per_tree_damage",
			spec.Pollution.PollutionRestoredPerTreeDamage)
		setFloat64(pollution, "max_pollution_to_restore_trees",
			spec.Pollution.MaxPollutionToRestoreTrees)
		setFloat64(pollution, "enemy_attack_pollution_consumption_modifier",
			spec.Pollution.EnemyAttackPollutionConsumptionModifier)
		if len(pollution) > 0 {
			settings["pollution"] = pollution
		}
	}

	if spec.EnemyEvolution != nil {
		evolution := map[string]any{}
		setBool(evolution, "enabled", spec.EnemyEvolution.Enabled)
		setFloat64(evolution, "time_factor", spec.EnemyEvolution.TimeFactor)
		setFloat64(evolution, "destroy_factor", spec.EnemyEvolution.DestroyFactor)
		setFloat64(evolution, "pollution_factor", spec.EnemyEvolution.PollutionFactor)
		if len(evolution) > 0 {
			settings["enemy_evolution"] = evolution
		}
	}

	if spec.EnemyExpansion != nil {
		expansion := map[string]any{}
		setBool(expansion, "enabled", spec.EnemyExpansion.Enabled)
		setInt32(expansion, "max_expansion_distance",
			spec.EnemyExpansion.MaxExpansionDistance)
		setInt32(expansion, "friendly_base_influence_radius",
			spec.EnemyExpansion.FriendlyBaseInfluenceRadius)
		setInt32(expansion, "enemy_building_influence_radius",
			spec.EnemyExpansion.EnemyBuildingInfluenceRadius)
		setFloat64(expansion, "building_coefficient",
			spec.EnemyExpansion.BuildingCoefficient)
		setFloat64(expansion, "other_base_coefficient",
			spec.EnemyExpansion.OtherBaseCoefficient)
		setFloat64(expansion, "neighbouring_chunk_coefficient",
			spec.EnemyExpansion.NeighbouringChunkCoefficient)
		setFloat64(expansion, "neighbouring_base_chunk_coefficient",
			spec.EnemyExpansion.NeighbouringBaseChunkCoefficient)
		setFloat64(expansion, "max_colliding_tiles_coefficient",
			spec.EnemyExpansion.MaxCollidingTilesCoefficient)
		setInt32(expansion, "settler_group_min_size",
			spec.EnemyExpansion.SettlerGroupMinSize)
		setInt32(expansion, "settler_group_max_size",
			spec.EnemyExpansion.SettlerGroupMaxSize)
		setInt32(expansion, "min_expansion_cooldown",
			spec.EnemyExpansion.MinExpansionCooldown)
		setInt32(expansion, "max_expansion_cooldown",
			spec.EnemyExpansion.MaxExpansionCooldown)
		if len(expansion) > 0 {
			settings["enemy_expansion"] = expansion
		}
	}

	if spec.DifficultySettings != nil {
		difficulty := map[string]any{}
		setInt32(difficulty, "recipe_difficulty",
			spec.DifficultySettings.RecipeDifficulty)
		setInt32(difficulty, "technology_difficulty",
			spec.DifficultySettings.TechnologyDifficulty)
		setFloat64(difficulty, "technology_price_multiplier",
			spec.DifficultySettings.TechnologyPriceMultiplier)
		setFloat64(difficulty, "spoil_time_modifier",
			spec.DifficultySettings.SpoilTimeModifier)
		if len(difficulty) > 0 {
			settings["difficulty_settings"] = difficulty
		}
	}

	setInt32(settings, "max_failed_behavior_count", spec.MaxFailedBehaviorCount)

	return render(settings, spec.Raw)
}
