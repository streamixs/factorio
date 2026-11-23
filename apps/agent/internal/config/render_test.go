package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	"sigs.k8s.io/yaml"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

func rawJSON(value string) *apiextensionsv1.JSON {
	return &apiextensionsv1.JSON{Raw: []byte(value)}
}

// loadSampleSpec reads the sample custom resource so the golden files stay
// tied to the documented example.
func loadSampleSpec(t *testing.T) gamesv1alpha1.FactorioServerSpec {
	t.Helper()

	path := filepath.Join("..", "..", "config", "samples",
		"games_v1alpha1_factorioserver.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read sample: %v", err)
	}

	var server gamesv1alpha1.FactorioServer
	if err := yaml.Unmarshal(data, &server); err != nil {
		t.Fatalf("parse sample: %v", err)
	}

	return server.Spec
}

func readGolden(t *testing.T, name string) string {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read golden file %s: %v", name, err)
	}

	return string(data)
}

func decode(t *testing.T, data []byte) map[string]any {
	t.Helper()

	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("decode output: %v", err)
	}

	return decoded
}

func nested(t *testing.T, root map[string]any, keys ...string) map[string]any {
	t.Helper()

	current := root
	for _, key := range keys {
		next, ok := current[key].(map[string]any)
		if !ok {
			t.Fatalf("key %q is not an object", key)
		}
		current = next
	}

	return current
}

func TestRenderSampleMatchesGoldenFiles(t *testing.T) {
	spec := loadSampleSpec(t)

	tests := []struct {
		name   string
		golden string
		render func() ([]byte, error)
	}{
		{
			name:   "server settings",
			golden: "server-settings.golden.json",
			render: func() ([]byte, error) {
				return RenderServerSettings(spec.Server, ServerSecretValues{})
			},
		},
		{
			name:   "map generation settings",
			golden: "map-gen-settings.golden.json",
			render: func() ([]byte, error) {
				return RenderMapGenSettings(spec.MapGenSettings)
			},
		},
		{
			name:   "map settings",
			golden: "map-settings.golden.json",
			render: func() ([]byte, error) {
				return RenderMapSettings(spec.MapSettings)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.render()
			if err != nil {
				t.Fatalf("render: %v", err)
			}

			if os.Getenv("UPDATE_GOLDEN") == "1" {
				path := filepath.Join("testdata", tt.golden)
				if err := os.WriteFile(path, got, 0o644); err != nil {
					t.Fatalf("update golden file %s: %v", path, err)
				}
			}

			if want := readGolden(t, tt.golden); string(got) != want {
				t.Errorf("unexpected output\n--- got ---\n%s\n--- want ---\n%s", got, want)
			}
		})
	}
}

func TestNilSpecRendersDefaults(t *testing.T) {
	server, err := RenderServerSettings(nil, ServerSecretValues{})
	if err != nil {
		t.Fatalf("render server settings: %v", err)
	}
	serverSettings := decode(t, server)

	if serverSettings["name"] != "Factorio Server" {
		t.Errorf("default name is %v", serverSettings["name"])
	}
	if _, ok := serverSettings["description"]; !ok {
		t.Error("default description is missing")
	}
	if _, ok := serverSettings["game_password"]; !ok {
		t.Error("default game_password is missing")
	}

	mapGen, err := RenderMapGenSettings(nil)
	if err != nil {
		t.Fatalf("render map generation settings: %v", err)
	}
	if got := decode(t, mapGen)["starting_area"]; got != float64(1) {
		t.Errorf("default starting_area is %v", got)
	}

	mapSettings, err := RenderMapSettings(nil)
	if err != nil {
		t.Fatalf("render map settings: %v", err)
	}
	if got := nested(t, decode(t, mapSettings), "pollution")["enabled"]; got != true {
		t.Errorf("default pollution.enabled is %v", got)
	}
}

func TestEmptySectionUsesDefaults(t *testing.T) {
	server, err := RenderServerSettings(
		&gamesv1alpha1.ServerSettingsSpec{},
		ServerSecretValues{},
	)
	if err != nil {
		t.Fatalf("render server settings: %v", err)
	}
	serverSettings := decode(t, server)

	if got := serverSettings["allow_commands"]; got != "admins-only" {
		t.Errorf("default allow_commands is %v", got)
	}
	if got := serverSettings["max_players"]; got != float64(0) {
		t.Errorf("default max_players is %v", got)
	}

	mapGen, err := RenderMapGenSettings(&gamesv1alpha1.MapGenSettingsSpec{})
	if err != nil {
		t.Fatalf("render map generation settings: %v", err)
	}
	controls := nested(t, decode(t, mapGen), "autoplace_controls")
	if got := nested(t, controls, "coal")["frequency"]; got != float64(1) {
		t.Errorf("default coal frequency is %v", got)
	}
}

func TestServerSecretsAreResolvedFromSelectors(t *testing.T) {
	spec := &gamesv1alpha1.ServerSettingsSpec{
		Access: &gamesv1alpha1.AccessControlSpec{
			MaxPlayers: new(int32(4)),
			GamePasswordRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: "server"},
				Key:                  "game-password",
			},
			AllowCommands: new(gamesv1alpha1.AllowCommandsAdminsOnly),
		},
		Authentication: &gamesv1alpha1.AuthenticationSpec{
			Username: new("factorio"),
			TokenRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: "server"},
				Key:                  "token",
			},
		},
	}

	got, err := RenderServerSettings(spec, ServerSecretValues{
		GamePassword: "hunter2",
		Password:     "unused",
		Token:        "api-token",
	})
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	settings := decode(t, got)

	if settings["game_password"] != "hunter2" {
		t.Errorf("game_password is %v", settings["game_password"])
	}
	if settings["token"] != "api-token" {
		t.Errorf("token is %v", settings["token"])
	}
	if settings["username"] != "factorio" {
		t.Errorf("username is %v", settings["username"])
	}
	if settings["max_players"] != float64(4) {
		t.Errorf("max_players is %v", settings["max_players"])
	}
	if settings["allow_commands"] != "admins-only" {
		t.Errorf("allow_commands is %v", settings["allow_commands"])
	}
	if settings["password"] != "" {
		t.Errorf("unreferenced password should keep the default, got %v",
			settings["password"])
	}
}

func TestMapGenSettingsMappings(t *testing.T) {
	spec := &gamesv1alpha1.MapGenSettingsSpec{
		Width: new(int32(1000)),
		StartingPoints: []gamesv1alpha1.MapPosition{
			{X: new(0.5), Y: new(-1.5)},
			{},
		},
		CliffSettings: &gamesv1alpha1.CliffSettingsSpec{
			Name:                   new("custom-cliff"),
			CliffElevation0:        new(10.0),
			CliffElevationInterval: new(20.0),
			Richness:               new(1.0),
		},
	}

	got, err := RenderMapGenSettings(spec)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	settings := decode(t, got)

	if settings["width"] != float64(1000) {
		t.Errorf("width is %v", settings["width"])
	}

	points, ok := settings["starting_points"].([]any)
	if !ok || len(points) != 2 {
		t.Fatalf("starting_points is %v", settings["starting_points"])
	}
	first, ok := points[0].(map[string]any)
	if !ok || first["x"] != 0.5 || first["y"] != -1.5 {
		t.Errorf("first starting point is %v", points[0])
	}

	cliffs := nested(t, settings, "cliff_settings")
	if cliffs["name"] != "custom-cliff" {
		t.Errorf("cliff name is %v", cliffs["name"])
	}
	if cliffs["cliff_elevation_interval"] != float64(20) {
		t.Errorf("cliff interval is %v", cliffs["cliff_elevation_interval"])
	}

	controls := nested(t, settings, "autoplace_controls")
	if got := nested(t, controls, "stone")["frequency"]; got != float64(1) {
		t.Errorf("untouched stone frequency is %v", got)
	}
}

func TestMapSettingsMappings(t *testing.T) {
	spec := &gamesv1alpha1.MapSettingsSpec{
		Pollution: &gamesv1alpha1.PollutionSpec{
			Enabled:                                 new(true),
			MinToDiffuse:                            new(0.1),
			ExpectedMaxPerChunk:                     new(2.0),
			EnemyAttackPollutionConsumptionModifier: new(1.5),
		},
		EnemyEvolution: &gamesv1alpha1.EnemyEvolutionSpec{
			DestroyFactor:   new(0.2),
			PollutionFactor: new(0.3),
		},
		EnemyExpansion: &gamesv1alpha1.EnemyExpansionSpec{
			BuildingCoefficient:          new(0.4),
			MaxCollidingTilesCoefficient: new(0.5),
			SettlerGroupMaxSize:          new(int32(6)),
		},
		DifficultySettings: &gamesv1alpha1.DifficultySettingsSpec{
			TechnologyPriceMultiplier: new(2.0),
			SpoilTimeModifier:         new(0.25),
		},
		MaxFailedBehaviorCount: new(int32(9)),
	}

	got, err := RenderMapSettings(spec)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	settings := decode(t, got)

	pollution := nested(t, settings, "pollution")
	if pollution["min_to_diffuse"] != 0.1 {
		t.Errorf("min_to_diffuse is %v", pollution["min_to_diffuse"])
	}
	if pollution["expected_max_per_chunk"] != float64(2) {
		t.Errorf("expected_max_per_chunk is %v",
			pollution["expected_max_per_chunk"])
	}

	evolution := nested(t, settings, "enemy_evolution")
	if evolution["destroy_factor"] != 0.2 {
		t.Errorf("destroy_factor is %v", evolution["destroy_factor"])
	}

	expansion := nested(t, settings, "enemy_expansion")
	if expansion["building_coefficient"] != 0.4 {
		t.Errorf("building_coefficient is %v",
			expansion["building_coefficient"])
	}
	if expansion["max_expansion_distance"] != float64(5) {
		t.Errorf("untouched max_expansion_distance is %v",
			expansion["max_expansion_distance"])
	}

	difficulty := nested(t, settings, "difficulty_settings")
	if difficulty["spoil_time_modifier"] != 0.25 {
		t.Errorf("spoil_time_modifier is %v",
			difficulty["spoil_time_modifier"])
	}

	if settings["max_failed_behavior_count"] != float64(9) {
		t.Errorf("max_failed_behavior_count is %v",
			settings["max_failed_behavior_count"])
	}
	if _, ok := settings["unit_group"]; !ok {
		t.Error("default unit_group is missing")
	}
}

func TestRawSettingsAreMerged(t *testing.T) {
	spec := &gamesv1alpha1.MapGenSettingsSpec{
		Seed: new(int64(42)),
		Raw:  rawJSON(`{"property_expression_names": {"elevation": "basic"}}`),
	}

	got, err := RenderMapGenSettings(spec)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	settings := decode(t, got)

	expressions := nested(t, settings, "property_expression_names")
	if expressions["elevation"] != "basic" {
		t.Errorf("elevation is %v", expressions["elevation"])
	}
	if expressions["control:moisture:bias"] != "0" {
		t.Errorf("default moisture bias was lost: %v",
			expressions["control:moisture:bias"])
	}
	if settings["seed"] != float64(42) {
		t.Errorf("seed is %v", settings["seed"])
	}
}

func TestServerRawRejectsSecrets(t *testing.T) {
	for _, key := range []string{"game_password", "password", "token"} {
		spec := &gamesv1alpha1.ServerSettingsSpec{
			Raw: rawJSON("{\"" + key + "\":\"secret\"}"),
		}

		_, err := RenderServerSettings(spec, ServerSecretValues{})
		if err == nil {
			t.Fatalf("expected an error for %s, got nil", key)
		}
		if !strings.Contains(err.Error(), key) {
			t.Errorf("error %q does not mention %s", err, key)
		}
	}
}

func TestServerRawAllowsNonSecretKeys(t *testing.T) {
	spec := &gamesv1alpha1.ServerSettingsSpec{
		Raw: rawJSON(`{"custom_setting": "value"}`),
	}

	got, err := RenderServerSettings(spec, ServerSecretValues{})
	if err != nil {
		t.Fatalf("render: %v", err)
	}

	settings := decode(t, got)
	if settings["custom_setting"] != "value" {
		t.Errorf("custom_setting is %v", settings["custom_setting"])
	}
}

func TestRawConflictingWithTypedFieldIsRejected(t *testing.T) {
	spec := &gamesv1alpha1.MapGenSettingsSpec{
		Seed: new(int64(42)),
		Raw:  rawJSON(`{"seed": 7}`),
	}

	_, err := RenderMapGenSettings(spec)
	if err == nil {
		t.Fatal("expected an error, got nil")
	}

	for _, expected := range []string{"raw", `"seed"`} {
		if !strings.Contains(err.Error(), expected) {
			t.Errorf("error %q does not mention %s", err, expected)
		}
	}
}

func TestInvalidRawIsRejected(t *testing.T) {
	spec := &gamesv1alpha1.MapSettingsSpec{
		Raw: rawJSON(`[1, 2]`),
	}

	_, err := RenderMapSettings(spec)
	if err == nil {
		t.Fatal("expected an error, got nil")
	}

	if !strings.Contains(err.Error(), "parse raw settings") {
		t.Errorf("error %q does not mention parsing", err)
	}
}

func TestRenderingIsDeterministic(t *testing.T) {
	spec := &gamesv1alpha1.MapSettingsSpec{
		Pollution: &gamesv1alpha1.PollutionSpec{
			Enabled:      new(true),
			MinToDiffuse: new(0.1),
		},
		EnemyEvolution: &gamesv1alpha1.EnemyEvolutionSpec{
			TimeFactor: new(0.000004),
		},
	}

	first, err := RenderMapSettings(spec)
	if err != nil {
		t.Fatalf("first render: %v", err)
	}

	second, err := RenderMapSettings(spec)
	if err != nil {
		t.Fatalf("second render: %v", err)
	}

	if string(first) != string(second) {
		t.Errorf("renders differ:\n%s\n---\n%s", first, second)
	}
}
