package config

import (
	"encoding/json"
	"fmt"

	corev1 "k8s.io/api/core/v1"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

const defaultFactorioVersion = "2.1.24"

// EffectiveSettings holds the default specification and the specification
// actually in effect once the user overrides are applied. The UI displays the
// effective values and diffs against the defaults to keep the custom resource
// sparse.
type EffectiveSettings struct {
	Defaults  []byte
	Effective []byte
}

// RenderEffectiveSettings returns the default and effective specifications as
// indented JSON documents.
func RenderEffectiveSettings(
	spec *gamesv1alpha1.FactorioServerSpec,
) (*EffectiveSettings, error) {
	defaults, err := defaultSpec()
	if err != nil {
		return nil, err
	}

	effective, err := EffectiveSpec(spec)
	if err != nil {
		return nil, err
	}

	defaultsJSON, err := json.MarshalIndent(defaults, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal default settings: %w", err)
	}

	effectiveJSON, err := json.MarshalIndent(effective, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal effective settings: %w", err)
	}

	return &EffectiveSettings{
		Defaults:  append(defaultsJSON, '\n'),
		Effective: append(effectiveJSON, '\n'),
	}, nil
}

// EffectiveSpec overlays the user overrides on the default specification.
func EffectiveSpec(
	user *gamesv1alpha1.FactorioServerSpec,
) (*gamesv1alpha1.FactorioServerSpec, error) {
	defaults, err := defaultSpec()
	if err != nil {
		return nil, err
	}

	if user == nil {
		return defaults, nil
	}

	defaultsJSON, err := json.Marshal(defaults)
	if err != nil {
		return nil, fmt.Errorf("marshal defaults: %w", err)
	}

	userJSON, err := json.Marshal(user)
	if err != nil {
		return nil, fmt.Errorf("marshal user settings: %w", err)
	}

	var merged, overrides map[string]any
	if err := json.Unmarshal(defaultsJSON, &merged); err != nil {
		return nil, fmt.Errorf("decode defaults: %w", err)
	}
	if err := json.Unmarshal(userJSON, &overrides); err != nil {
		return nil, fmt.Errorf("decode user settings: %w", err)
	}

	mergeMaps(merged, overrides)

	mergedJSON, err := json.Marshal(merged)
	if err != nil {
		return nil, fmt.Errorf("marshal merged settings: %w", err)
	}

	var effective gamesv1alpha1.FactorioServerSpec
	if err := json.Unmarshal(mergedJSON, &effective); err != nil {
		return nil, fmt.Errorf("decode effective settings: %w", err)
	}

	return &effective, nil
}

func defaultSpec() (*gamesv1alpha1.FactorioServerSpec, error) {
	server, err := defaultSettings(ServerSettingsFile)
	if err != nil {
		return nil, err
	}

	mapGen, err := defaultSettings(MapGenSettingsFile)
	if err != nil {
		return nil, err
	}

	mapSettings, err := defaultSettings(MapSettingsFile)
	if err != nil {
		return nil, err
	}

	return &gamesv1alpha1.FactorioServerSpec{
		Version: defaultFactorioVersion,
		Server: &gamesv1alpha1.ServerSettingsSpec{
			Identity: &gamesv1alpha1.ServerIdentitySpec{
				Name:        new(stringAt(server, "Factorio Server", "name")),
				Description: new(stringAt(server, "", "description")),
				Tags:        stringSliceAt(server, "tags"),
			},
			Access: &gamesv1alpha1.AccessControlSpec{
				MaxPlayers: new(int32At(server, 0, "max_players")),
				RequireUserVerification: new(
					boolAt(server, true, "require_user_verification"),
				),
				Visibility: &gamesv1alpha1.VisibilitySpec{
					Public: new(boolAt(server, true, "visibility", "public")),
					Lan:    new(boolAt(server, true, "visibility", "lan")),
				},
				AllowCommands: new(
					gamesv1alpha1.AllowCommands(
						stringAt(server, "admins-only", "allow_commands"),
					),
				),
			},
			AutoSave: &gamesv1alpha1.AutoSaveSpec{
				Interval:          new(int32At(server, 10, "autosave_interval")),
				Slots:             new(int32At(server, 5, "autosave_slots")),
				NonBlockingSaving: new(boolAt(server, false, "non_blocking_saving")),
				OnlyOnServer:      new(boolAt(server, true, "autosave_only_on_server")),
			},
			PlayerManagement: &gamesv1alpha1.PlayerManagementSpec{
				AfkAutokickInterval: new(
					int32At(server, 0, "afk_autokick_interval"),
				),
				AutoPauseWhenNoPlayers: new(boolAt(server, true, "auto_pause")),
				OnlyAdminsCanPause: new(
					boolAt(server, true, "only_admins_can_pause_the_game"),
				),
				IgnorePlayerLimitForReturningPlayers: new(
					boolAt(server, false, "ignore_player_limit_for_returning_players"),
				),
				MaxUploadSlots: new(int32At(server, 5, "max_upload_slots")),
				MaxUploadKilobytesPerSecond: new(
					int32At(server, 0, "max_upload_in_kilobytes_per_second"),
				),
				MinimumLatencyInTicks: new(
					int32At(server, 0, "minimum_latency_in_ticks"),
				),
				MaxHeartbeatsPerSecond: new(
					int32At(server, 60, "max_heartbeats_per_second"),
				),
			},
			Authentication: &gamesv1alpha1.AuthenticationSpec{
				Username: new(stringAt(server, "", "username")),
			},
		},
		MapGenSettings: &gamesv1alpha1.MapGenSettingsSpec{
			TerrainSegmentation: new(1.0),
			Water:               new(1.0),
			Width:               new(int32At(mapGen, 0, "width")),
			Height:              new(int32At(mapGen, 0, "height")),
			StartingArea:        new(floatAt(mapGen, 1, "starting_area")),
			PeacefulMode:        new(boolAt(mapGen, false, "peaceful_mode")),
			StartingPoints:      startingPointsAt(mapGen),
			AutoplaceControls:   autoplaceControlsAt(mapGen),
			CliffSettings:       cliffSettingsAt(mapGen),
		},
		MapSettings: &gamesv1alpha1.MapSettingsSpec{
			Pollution:      pollutionAt(mapSettings),
			EnemyEvolution: enemyEvolutionAt(mapSettings),
			EnemyExpansion: enemyExpansionAt(mapSettings),
			DifficultySettings: &gamesv1alpha1.DifficultySettingsSpec{
				RecipeDifficulty:     new(int32(0)),
				TechnologyDifficulty: new(int32(0)),
				TechnologyPriceMultiplier: new(
					floatAt(mapSettings, 1, "difficulty_settings",
						"technology_price_multiplier"),
				),
				SpoilTimeModifier: new(
					floatAt(mapSettings, 1, "difficulty_settings",
						"spoil_time_modifier"),
				),
			},
			MaxFailedBehaviorCount: new(
				int32At(mapSettings, 3, "max_failed_behavior_count"),
			),
		},
		Storage: &gamesv1alpha1.StorageSpec{Size: "10Gi"},
		Resources: &gamesv1alpha1.ResourcesSpec{
			CPURequest:    "500m",
			CPULimit:      "2",
			MemoryRequest: "1Gi",
			MemoryLimit:   "4Gi",
		},
		Service: &gamesv1alpha1.ServiceSpec{
			Type: corev1.ServiceTypeClusterIP,
		},
	}, nil
}

func startingPointsAt(settings map[string]any) []gamesv1alpha1.MapPosition {
	points, ok := settings["starting_points"].([]any)
	if !ok {
		return nil
	}

	result := make([]gamesv1alpha1.MapPosition, 0, len(points))
	for _, point := range points {
		values, ok := point.(map[string]any)
		if !ok {
			continue
		}
		result = append(result, gamesv1alpha1.MapPosition{
			X: optionalFloat(values["x"]),
			Y: optionalFloat(values["y"]),
		})
	}
	return result
}

func autoplaceControlsAt(
	settings map[string]any,
) map[string]gamesv1alpha1.AutoplaceControlSpec {
	controls, ok := settings["autoplace_controls"].(map[string]any)
	if !ok {
		return nil
	}

	result := make(map[string]gamesv1alpha1.AutoplaceControlSpec, len(controls))
	for name, control := range controls {
		values, ok := control.(map[string]any)
		if !ok {
			continue
		}
		result[name] = gamesv1alpha1.AutoplaceControlSpec{
			Frequency: optionalFloat(values["frequency"]),
			Size:      optionalFloat(values["size"]),
			Richness:  optionalFloat(values["richness"]),
		}
	}
	return result
}

func cliffSettingsAt(settings map[string]any) *gamesv1alpha1.CliffSettingsSpec {
	cliffs, ok := settings["cliff_settings"].(map[string]any)
	if !ok {
		return nil
	}

	return &gamesv1alpha1.CliffSettingsSpec{
		Name:                   new(stringAt(cliffs, "cliff", "name")),
		CliffElevation0:        new(floatAt(cliffs, 10, "cliff_elevation_0")),
		CliffElevationInterval: new(floatAt(cliffs, 40, "cliff_elevation_interval")),
		Richness:               new(floatAt(cliffs, 1, "richness")),
	}
}

func pollutionAt(settings map[string]any) *gamesv1alpha1.PollutionSpec {
	pollution, ok := settings["pollution"].(map[string]any)
	if !ok {
		return nil
	}

	return &gamesv1alpha1.PollutionSpec{
		Enabled: new(boolAt(pollution, true, "enabled")),
		DiffusionRatio: new(
			floatAt(pollution, 0.02, "diffusion_ratio"),
		),
		MinToDiffuse: new(floatAt(pollution, 15, "min_to_diffuse")),
		Ageing:       new(floatAt(pollution, 1, "ageing")),
		ExpectedMaxPerChunk: new(
			floatAt(pollution, 150, "expected_max_per_chunk"),
		),
		MinToShowPerChunk: new(
			floatAt(pollution, 50, "min_to_show_per_chunk"),
		),
		MinPollutionToDamageTrees: new(
			floatAt(pollution, 60, "min_pollution_to_damage_trees"),
		),
		PollutionWithMaxForestDamage: new(
			floatAt(pollution, 150, "pollution_with_max_forest_damage"),
		),
		PollutionPerTreeDamage: new(
			floatAt(pollution, 50, "pollution_per_tree_damage"),
		),
		PollutionRestoredPerTreeDamage: new(
			floatAt(pollution, 10, "pollution_restored_per_tree_damage"),
		),
		MaxPollutionToRestoreTrees: new(
			floatAt(pollution, 0, "max_pollution_to_restore_trees"),
		),
		EnemyAttackPollutionConsumptionModifier: new(
			floatAt(pollution, 1, "enemy_attack_pollution_consumption_modifier"),
		),
	}
}

func enemyEvolutionAt(
	settings map[string]any,
) *gamesv1alpha1.EnemyEvolutionSpec {
	evolution, ok := settings["enemy_evolution"].(map[string]any)
	if !ok {
		return nil
	}

	return &gamesv1alpha1.EnemyEvolutionSpec{
		Enabled:    new(boolAt(evolution, true, "enabled")),
		TimeFactor: new(floatAt(evolution, 0.000004, "time_factor")),
		DestroyFactor: new(
			floatAt(evolution, 0.002, "destroy_factor"),
		),
		PollutionFactor: new(
			floatAt(evolution, 0.0000009, "pollution_factor"),
		),
	}
}

func enemyExpansionAt(
	settings map[string]any,
) *gamesv1alpha1.EnemyExpansionSpec {
	expansion, ok := settings["enemy_expansion"].(map[string]any)
	if !ok {
		return nil
	}

	return &gamesv1alpha1.EnemyExpansionSpec{
		Enabled: new(boolAt(expansion, true, "enabled")),
		MaxExpansionDistance: new(
			int32At(expansion, 5, "max_expansion_distance"),
		),
		FriendlyBaseInfluenceRadius: new(
			int32At(expansion, 6, "friendly_base_influence_radius"),
		),
		EnemyBuildingInfluenceRadius: new(
			int32At(expansion, 3, "enemy_building_influence_radius"),
		),
		BuildingCoefficient: new(
			floatAt(expansion, 0.5, "building_coefficient"),
		),
		OtherBaseCoefficient: new(
			floatAt(expansion, 3, "other_base_coefficient"),
		),
		NeighbouringChunkCoefficient: new(
			floatAt(expansion, 0.5, "neighbouring_chunk_coefficient"),
		),
		NeighbouringBaseChunkCoefficient: new(
			floatAt(expansion, 0.5, "neighbouring_base_chunk_coefficient"),
		),
		MaxCollidingTilesCoefficient: new(
			floatAt(expansion, 0.8, "max_colliding_tiles_coefficient"),
		),
		SettlerGroupMinSize: new(
			int32At(expansion, 5, "settler_group_min_size"),
		),
		SettlerGroupMaxSize: new(
			int32At(expansion, 10, "settler_group_max_size"),
		),
		MinExpansionCooldown: new(
			int32At(expansion, 14400, "min_expansion_cooldown"),
		),
		MaxExpansionCooldown: new(
			int32At(expansion, 216000, "max_expansion_cooldown"),
		),
	}
}

func valueAt(settings map[string]any, keys ...string) any {
	var current any = settings

	for _, key := range keys {
		values, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current = values[key]
	}

	return current
}

func stringAt(settings map[string]any, fallback string, keys ...string) string {
	if value, ok := valueAt(settings, keys...).(string); ok {
		return value
	}
	return fallback
}

func boolAt(settings map[string]any, fallback bool, keys ...string) bool {
	if value, ok := valueAt(settings, keys...).(bool); ok {
		return value
	}
	return fallback
}

func floatAt(settings map[string]any, fallback float64, keys ...string) float64 {
	if value, ok := floatValue(valueAt(settings, keys...)); ok {
		return value
	}
	return fallback
}

func int32At(settings map[string]any, fallback int32, keys ...string) int32 {
	if value, ok := floatValue(valueAt(settings, keys...)); ok {
		return int32(value)
	}
	return fallback
}

func stringSliceAt(settings map[string]any, key string) []string {
	values, ok := settings[key].([]any)
	if !ok {
		return []string{}
	}

	result := make([]string, 0, len(values))
	for _, value := range values {
		if text, ok := value.(string); ok {
			result = append(result, text)
		}
	}
	return result
}

func optionalFloat(value any) *float64 {
	number, ok := floatValue(value)
	if !ok {
		return nil
	}
	return &number
}

func floatValue(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case int:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	default:
		return 0, false
	}
}
