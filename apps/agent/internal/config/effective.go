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
				Name:        ptrString(stringAt(server, "Factorio Server", "name")),
				Description: ptrString(stringAt(server, "", "description")),
				Tags:        stringSliceAt(server, "tags"),
			},
			Access: &gamesv1alpha1.AccessControlSpec{
				MaxPlayers: ptrInt32(int32At(server, 0, "max_players")),
				RequireUserVerification: ptrBool(
					boolAt(server, true, "require_user_verification"),
				),
				Visibility: &gamesv1alpha1.VisibilitySpec{
					Public: ptrBool(boolAt(server, true, "visibility", "public")),
					Lan:    ptrBool(boolAt(server, true, "visibility", "lan")),
				},
				AllowCommands: ptrAllowCommands(
					gamesv1alpha1.AllowCommands(
						stringAt(server, "admins-only", "allow_commands"),
					),
				),
			},
			AutoSave: &gamesv1alpha1.AutoSaveSpec{
				Interval:          ptrInt32(int32At(server, 10, "autosave_interval")),
				Slots:             ptrInt32(int32At(server, 5, "autosave_slots")),
				NonBlockingSaving: ptrBool(boolAt(server, false, "non_blocking_saving")),
				OnlyOnServer:      ptrBool(boolAt(server, true, "autosave_only_on_server")),
			},
			PlayerManagement: &gamesv1alpha1.PlayerManagementSpec{
				AfkAutokickInterval: ptrInt32(
					int32At(server, 0, "afk_autokick_interval"),
				),
				AutoPauseWhenNoPlayers: ptrBool(boolAt(server, true, "auto_pause")),
				OnlyAdminsCanPause: ptrBool(
					boolAt(server, true, "only_admins_can_pause_the_game"),
				),
				IgnorePlayerLimitForReturningPlayers: ptrBool(
					boolAt(server, false, "ignore_player_limit_for_returning_players"),
				),
				MaxUploadSlots: ptrInt32(int32At(server, 5, "max_upload_slots")),
				MaxUploadKilobytesPerSecond: ptrInt32(
					int32At(server, 0, "max_upload_in_kilobytes_per_second"),
				),
				MinimumLatencyInTicks: ptrInt32(
					int32At(server, 0, "minimum_latency_in_ticks"),
				),
				MaxHeartbeatsPerSecond: ptrInt32(
					int32At(server, 60, "max_heartbeats_per_second"),
				),
			},
			Authentication: &gamesv1alpha1.AuthenticationSpec{
				Username: ptrString(stringAt(server, "", "username")),
			},
		},
		MapGenSettings: &gamesv1alpha1.MapGenSettingsSpec{
			TerrainSegmentation: ptrFloat(1),
			Water:               ptrFloat(1),
			Width:               ptrInt32(int32At(mapGen, 0, "width")),
			Height:              ptrInt32(int32At(mapGen, 0, "height")),
			StartingArea:        ptrFloat(floatAt(mapGen, 1, "starting_area")),
			PeacefulMode:        ptrBool(boolAt(mapGen, false, "peaceful_mode")),
			StartingPoints:      startingPointsAt(mapGen),
			AutoplaceControls:   autoplaceControlsAt(mapGen),
			CliffSettings:       cliffSettingsAt(mapGen),
		},
		MapSettings: &gamesv1alpha1.MapSettingsSpec{
			Pollution:      pollutionAt(mapSettings),
			EnemyEvolution: enemyEvolutionAt(mapSettings),
			EnemyExpansion: enemyExpansionAt(mapSettings),
			DifficultySettings: &gamesv1alpha1.DifficultySettingsSpec{
				RecipeDifficulty:     ptrInt32(0),
				TechnologyDifficulty: ptrInt32(0),
				TechnologyPriceMultiplier: ptrFloat(
					floatAt(mapSettings, 1, "difficulty_settings",
						"technology_price_multiplier"),
				),
				SpoilTimeModifier: ptrFloat(
					floatAt(mapSettings, 1, "difficulty_settings",
						"spoil_time_modifier"),
				),
			},
			MaxFailedBehaviorCount: ptrInt32(
				int32At(mapSettings, 3, "max_failed_behavior_count"),
			),
		},
		Storage: &gamesv1alpha1.StorageSpec{Size: "10Gi"},
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
		Name:                   ptrString(stringAt(cliffs, "cliff", "name")),
		CliffElevation0:        ptrFloat(floatAt(cliffs, 10, "cliff_elevation_0")),
		CliffElevationInterval: ptrFloat(floatAt(cliffs, 40, "cliff_elevation_interval")),
		Richness:               ptrFloat(floatAt(cliffs, 1, "richness")),
	}
}

func pollutionAt(settings map[string]any) *gamesv1alpha1.PollutionSpec {
	pollution, ok := settings["pollution"].(map[string]any)
	if !ok {
		return nil
	}

	return &gamesv1alpha1.PollutionSpec{
		Enabled: ptrBool(boolAt(pollution, true, "enabled")),
		DiffusionRatio: ptrFloat(
			floatAt(pollution, 0.02, "diffusion_ratio"),
		),
		MinToDiffuse: ptrFloat(floatAt(pollution, 15, "min_to_diffuse")),
		Ageing:       ptrFloat(floatAt(pollution, 1, "ageing")),
		ExpectedMaxPerChunk: ptrFloat(
			floatAt(pollution, 150, "expected_max_per_chunk"),
		),
		MinToShowPerChunk: ptrFloat(
			floatAt(pollution, 50, "min_to_show_per_chunk"),
		),
		MinPollutionToDamageTrees: ptrFloat(
			floatAt(pollution, 60, "min_pollution_to_damage_trees"),
		),
		PollutionWithMaxForestDamage: ptrFloat(
			floatAt(pollution, 150, "pollution_with_max_forest_damage"),
		),
		PollutionPerTreeDamage: ptrFloat(
			floatAt(pollution, 50, "pollution_per_tree_damage"),
		),
		PollutionRestoredPerTreeDamage: ptrFloat(
			floatAt(pollution, 10, "pollution_restored_per_tree_damage"),
		),
		MaxPollutionToRestoreTrees: ptrFloat(
			floatAt(pollution, 0, "max_pollution_to_restore_trees"),
		),
		EnemyAttackPollutionConsumptionModifier: ptrFloat(
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
		Enabled:    ptrBool(boolAt(evolution, true, "enabled")),
		TimeFactor: ptrFloat(floatAt(evolution, 0.000004, "time_factor")),
		DestroyFactor: ptrFloat(
			floatAt(evolution, 0.002, "destroy_factor"),
		),
		PollutionFactor: ptrFloat(
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
		Enabled: ptrBool(boolAt(expansion, true, "enabled")),
		MaxExpansionDistance: ptrInt32(
			int32At(expansion, 5, "max_expansion_distance"),
		),
		FriendlyBaseInfluenceRadius: ptrInt32(
			int32At(expansion, 6, "friendly_base_influence_radius"),
		),
		EnemyBuildingInfluenceRadius: ptrInt32(
			int32At(expansion, 3, "enemy_building_influence_radius"),
		),
		BuildingCoefficient: ptrFloat(
			floatAt(expansion, 0.5, "building_coefficient"),
		),
		OtherBaseCoefficient: ptrFloat(
			floatAt(expansion, 3, "other_base_coefficient"),
		),
		NeighbouringChunkCoefficient: ptrFloat(
			floatAt(expansion, 0.5, "neighbouring_chunk_coefficient"),
		),
		NeighbouringBaseChunkCoefficient: ptrFloat(
			floatAt(expansion, 0.5, "neighbouring_base_chunk_coefficient"),
		),
		MaxCollidingTilesCoefficient: ptrFloat(
			floatAt(expansion, 0.8, "max_colliding_tiles_coefficient"),
		),
		SettlerGroupMinSize: ptrInt32(
			int32At(expansion, 5, "settler_group_min_size"),
		),
		SettlerGroupMaxSize: ptrInt32(
			int32At(expansion, 10, "settler_group_max_size"),
		),
		MinExpansionCooldown: ptrInt32(
			int32At(expansion, 14400, "min_expansion_cooldown"),
		),
		MaxExpansionCooldown: ptrInt32(
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

func ptrString(value string) *string { return &value }

func ptrBool(value bool) *bool { return &value }

func ptrInt32(value int32) *int32 { return &value }

func ptrFloat(value float64) *float64 { return &value }

func ptrAllowCommands(
	value gamesv1alpha1.AllowCommands,
) *gamesv1alpha1.AllowCommands {
	return &value
}
