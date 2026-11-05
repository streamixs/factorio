package config

import (
	"encoding/json"
	"testing"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

func TestEffectiveSpecFillsDefaults(t *testing.T) {
	user := &gamesv1alpha1.FactorioServerSpec{
		Server: &gamesv1alpha1.ServerSettingsSpec{
			Identity: &gamesv1alpha1.ServerIdentitySpec{
				Name: ptr("Custom Server"),
			},
			Access: &gamesv1alpha1.AccessControlSpec{
				MaxPlayers: ptr(int32(12)),
				Visibility: &gamesv1alpha1.VisibilitySpec{
					Public: ptr(false),
				},
			},
		},
		MapGenSettings: &gamesv1alpha1.MapGenSettingsSpec{
			Seed: ptr(int64(42)),
			AutoplaceControls: map[string]gamesv1alpha1.AutoplaceControlSpec{
				"coal": {Frequency: ptr(2.0)},
			},
		},
	}

	effective, err := EffectiveSpec(user)
	if err != nil {
		t.Fatalf("effective spec: %v", err)
	}

	if effective.Version != defaultFactorioVersion {
		t.Errorf("version is %q", effective.Version)
	}

	if got := *effective.Server.Identity.Name; got != "Custom Server" {
		t.Errorf("name is %q", got)
	}
	if got := *effective.Server.Identity.Description; got != "" {
		t.Errorf("default description is %q", got)
	}
	if len(effective.Server.Identity.Tags) != 0 {
		t.Errorf("default tags are %v", effective.Server.Identity.Tags)
	}

	if got := *effective.Server.Access.MaxPlayers; got != 12 {
		t.Errorf("maxPlayers is %d", got)
	}
	if effective.Server.Access.Visibility.Public == nil ||
		*effective.Server.Access.Visibility.Public {
		t.Error("explicit public=false was not preserved")
	}
	if effective.Server.Access.Visibility.Lan == nil ||
		!*effective.Server.Access.Visibility.Lan {
		t.Error("default lan=true was not filled")
	}
	if got := *effective.Server.Access.AllowCommands; got !=
		gamesv1alpha1.AllowCommandsAdminsOnly {
		t.Errorf("allowCommands is %q", got)
	}

	if got := *effective.Server.AutoSave.Interval; got != 10 {
		t.Errorf("autosave interval is %d", got)
	}
	if got := *effective.Server.PlayerManagement.MaxHeartbeatsPerSecond; got != 60 {
		t.Errorf("max heartbeats is %d", got)
	}

	if got := *effective.MapGenSettings.TerrainSegmentation; got != 1 {
		t.Errorf("terrain segmentation is %v", got)
	}
	if effective.MapGenSettings.Seed == nil ||
		*effective.MapGenSettings.Seed != 42 {
		t.Error("seed override was not preserved")
	}
	if len(effective.MapGenSettings.StartingPoints) != 1 {
		t.Errorf("starting points are %v", effective.MapGenSettings.StartingPoints)
	}

	coal := effective.MapGenSettings.AutoplaceControls["coal"]
	if coal.Frequency == nil || *coal.Frequency != 2 {
		t.Error("coal frequency override was not preserved")
	}
	if coal.Size == nil || *coal.Size != 1 {
		t.Error("coal size default was not preserved")
	}

	stone := effective.MapGenSettings.AutoplaceControls["stone"]
	if stone.Frequency == nil || *stone.Frequency != 1 {
		t.Error("stone default frequency was not filled")
	}

	if effective.MapSettings.Pollution == nil ||
		effective.MapSettings.Pollution.Enabled == nil ||
		!*effective.MapSettings.Pollution.Enabled {
		t.Error("default pollution enabled was not filled")
	}
	if effective.MapSettings.EnemyEvolution == nil ||
		effective.MapSettings.EnemyEvolution.TimeFactor == nil ||
		*effective.MapSettings.EnemyEvolution.TimeFactor != 0.000004 {
		t.Error("default enemy evolution was not filled")
	}

	if got := effective.Storage.Size; got != "10Gi" {
		t.Errorf("storage size is %q", got)
	}
	if got := effective.Service.Type; got != "ClusterIP" {
		t.Errorf("service type is %q", got)
	}
}

func TestRenderEffectiveSettingsProducesJSON(t *testing.T) {
	user := &gamesv1alpha1.FactorioServerSpec{
		Server: &gamesv1alpha1.ServerSettingsSpec{
			Access: &gamesv1alpha1.AccessControlSpec{
				MaxPlayers: ptr(int32(4)),
				Visibility: &gamesv1alpha1.VisibilitySpec{
					Public: ptr(false),
				},
			},
		},
	}

	settings, err := RenderEffectiveSettings(user)
	if err != nil {
		t.Fatalf("render effective settings: %v", err)
	}

	var defaults map[string]any
	if err := json.Unmarshal(settings.Defaults, &defaults); err != nil {
		t.Fatalf("decode defaults: %v", err)
	}
	if got := nestedMap(t, defaults, "server", "access")["maxPlayers"]; got != float64(0) {
		t.Errorf("default maxPlayers is %v", got)
	}

	var effective map[string]any
	if err := json.Unmarshal(settings.Effective, &effective); err != nil {
		t.Fatalf("decode effective: %v", err)
	}
	access := nestedMap(t, effective, "server", "access")
	if got := access["maxPlayers"]; got != float64(4) {
		t.Errorf("effective maxPlayers is %v", got)
	}
	visibility := nestedMap(t, access, "visibility")
	if got := visibility["public"]; got != false {
		t.Errorf("effective visibility.public is %v", got)
	}
	if got := visibility["lan"]; got != true {
		t.Errorf("effective visibility.lan is %v", got)
	}
}

func nestedMap(t *testing.T, root map[string]any, keys ...string) map[string]any {
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
