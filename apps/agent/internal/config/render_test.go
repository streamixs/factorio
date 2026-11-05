package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	"sigs.k8s.io/yaml"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

func ptr[T any](value T) *T {
	return &value
}

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

			if want := readGolden(t, tt.golden); string(got) != want {
				t.Errorf("unexpected output\n--- got ---\n%s\n--- want ---\n%s", got, want)
			}
		})
	}
}

func TestNilSpecRendersEmptyObject(t *testing.T) {
	tests := map[string]func() ([]byte, error){
		"server settings": func() ([]byte, error) {
			return RenderServerSettings(nil, ServerSecretValues{})
		},
		"map generation settings": func() ([]byte, error) {
			return RenderMapGenSettings(nil)
		},
		"map settings": func() ([]byte, error) {
			return RenderMapSettings(nil)
		},
	}

	for name, render := range tests {
		t.Run(name, func(t *testing.T) {
			got, err := render()
			if err != nil {
				t.Fatalf("render: %v", err)
			}

			if want := "{}\n"; string(got) != want {
				t.Errorf("got %q, want %q", got, want)
			}
		})
	}
}

func TestEmptySectionIsOmitted(t *testing.T) {
	tests := map[string]func() ([]byte, error){
		"server settings": func() ([]byte, error) {
			return RenderServerSettings(
				&gamesv1alpha1.ServerSettingsSpec{
					Access: &gamesv1alpha1.AccessControlSpec{},
				},
				ServerSecretValues{},
			)
		},
		"map generation settings": func() ([]byte, error) {
			return RenderMapGenSettings(
				&gamesv1alpha1.MapGenSettingsSpec{
					CliffSettings: &gamesv1alpha1.CliffSettingsSpec{},
				},
			)
		},
		"map settings": func() ([]byte, error) {
			return RenderMapSettings(
				&gamesv1alpha1.MapSettingsSpec{
					Pollution: &gamesv1alpha1.PollutionSpec{},
				},
			)
		},
	}

	for name, render := range tests {
		t.Run(name, func(t *testing.T) {
			got, err := render()
			if err != nil {
				t.Fatalf("render: %v", err)
			}

			if want := "{}\n"; string(got) != want {
				t.Errorf("got %q, want %q", got, want)
			}
		})
	}
}

func TestServerSecretsAreResolvedFromSelectors(t *testing.T) {
	spec := &gamesv1alpha1.ServerSettingsSpec{
		Access: &gamesv1alpha1.AccessControlSpec{
			MaxPlayers: ptr(int32(4)),
			GamePasswordRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: "server"},
				Key:                  "game-password",
			},
			AllowCommands: ptr(gamesv1alpha1.AllowCommandsAdminsOnly),
		},
		Authentication: &gamesv1alpha1.AuthenticationSpec{
			Username: ptr("factorio"),
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

	want := `{
  "allow_commands": "admins-only",
  "game_password": "hunter2",
  "max_players": 4,
  "token": "api-token",
  "username": "factorio"
}
`
	if string(got) != want {
		t.Errorf("unexpected output\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestMapGenSettingsMappings(t *testing.T) {
	spec := &gamesv1alpha1.MapGenSettingsSpec{
		Width: ptr(int32(1000)),
		StartingPoints: []gamesv1alpha1.MapPosition{
			{X: ptr(0.5), Y: ptr(-1.5)},
			{},
		},
		CliffSettings: &gamesv1alpha1.CliffSettingsSpec{
			Name:                   ptr("cliff"),
			CliffElevation0:        ptr(10.0),
			CliffElevationInterval: ptr(20.0),
			Richness:               ptr(1.0),
		},
	}

	got, err := RenderMapGenSettings(spec)
	if err != nil {
		t.Fatalf("render: %v", err)
	}

	want := `{
  "cliff_settings": {
    "cliff_elevation_0": 10,
    "cliff_elevation_interval": 20,
    "name": "cliff",
    "richness": 1
  },
  "starting_points": [
    {
      "x": 0.5,
      "y": -1.5
    },
    {}
  ],
  "width": 1000
}
`
	if string(got) != want {
		t.Errorf("unexpected output\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestMapSettingsMappings(t *testing.T) {
	spec := &gamesv1alpha1.MapSettingsSpec{
		Pollution: &gamesv1alpha1.PollutionSpec{
			Enabled:                                 ptr(true),
			MinToDiffuse:                            ptr(0.1),
			ExpectedMaxPerChunk:                     ptr(2.0),
			EnemyAttackPollutionConsumptionModifier: ptr(1.5),
		},
		EnemyEvolution: &gamesv1alpha1.EnemyEvolutionSpec{
			DestroyFactor:   ptr(0.2),
			PollutionFactor: ptr(0.3),
		},
		EnemyExpansion: &gamesv1alpha1.EnemyExpansionSpec{
			BuildingCoefficient:          ptr(0.4),
			MaxCollidingTilesCoefficient: ptr(0.5),
			SettlerGroupMaxSize:          ptr(int32(6)),
		},
		DifficultySettings: &gamesv1alpha1.DifficultySettingsSpec{
			TechnologyPriceMultiplier: ptr(2.0),
			SpoilTimeModifier:         ptr(0.25),
		},
		MaxFailedBehaviorCount: ptr(int32(9)),
	}

	got, err := RenderMapSettings(spec)
	if err != nil {
		t.Fatalf("render: %v", err)
	}

	want := `{
  "difficulty_settings": {
    "spoil_time_modifier": 0.25,
    "technology_price_multiplier": 2
  },
  "enemy_evolution": {
    "destroy_factor": 0.2,
    "pollution_factor": 0.3
  },
  "enemy_expansion": {
    "building_coefficient": 0.4,
    "max_colliding_tiles_coefficient": 0.5,
    "settler_group_max_size": 6
  },
  "max_failed_behavior_count": 9,
  "pollution": {
    "enabled": true,
    "enemy_attack_pollution_consumption_modifier": 1.5,
    "expected_max_per_chunk": 2,
    "min_to_diffuse": 0.1
  }
}
`
	if string(got) != want {
		t.Errorf("unexpected output\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestRawSettingsAreMerged(t *testing.T) {
	spec := &gamesv1alpha1.MapGenSettingsSpec{
		Seed: ptr(int64(42)),
		Raw:  rawJSON(`{"property_expression_names": {"elevation": "basic"}}`),
	}

	got, err := RenderMapGenSettings(spec)
	if err != nil {
		t.Fatalf("render: %v", err)
	}

	want := `{
  "property_expression_names": {
    "elevation": "basic"
  },
  "seed": 42
}
`
	if string(got) != want {
		t.Errorf("unexpected output\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestRawConflictingWithTypedFieldIsRejected(t *testing.T) {
	spec := &gamesv1alpha1.MapGenSettingsSpec{
		Seed: ptr(int64(42)),
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
			Enabled:      ptr(true),
			MinToDiffuse: ptr(0.1),
		},
		EnemyEvolution: &gamesv1alpha1.EnemyEvolutionSpec{
			TimeFactor: ptr(0.000004),
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
