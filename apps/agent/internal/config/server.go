package config

import (
	"slices"

	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

// RenderServerSettings renders spec into a server-settings.json document.
// secrets holds the values referenced by the game password, account password
// and API token selectors. Unset typed fields keep the Factorio defaults.
func RenderServerSettings(
	spec *gamesv1alpha1.ServerSettingsSpec,
	secrets ServerSecretValues,
) ([]byte, error) {
	overrides := map[string]any{}
	var raw *apiextensionsv1.JSON

	if spec != nil {
		if err := validateServerRaw(spec.Raw); err != nil {
			return nil, err
		}
		raw = spec.Raw
		renderIdentity(overrides, spec.Identity)
		renderAccess(overrides, spec.Access, secrets)
		renderAutoSave(overrides, spec.AutoSave)
		renderPlayerManagement(overrides, spec.PlayerManagement)
		renderAuthentication(overrides, spec.Authentication, secrets)
	}

	defaults, err := defaultSettings(ServerSettingsFile)
	if err != nil {
		return nil, err
	}

	return render(defaults, overrides, raw)
}

// renderIdentity writes the identity fields. Factorio stores them at the top
// level of server-settings.json.
func renderIdentity(settings map[string]any, spec *gamesv1alpha1.ServerIdentitySpec) {
	if spec == nil {
		return
	}

	setString(settings, "name", spec.Name)
	setString(settings, "description", spec.Description)
	if spec.Tags != nil {
		settings["tags"] = slices.Clone(spec.Tags)
	}
}

// renderAccess writes the access control fields.
func renderAccess(
	settings map[string]any,
	spec *gamesv1alpha1.AccessControlSpec,
	secrets ServerSecretValues,
) {
	if spec == nil {
		return
	}

	setInt32(settings, "max_players", spec.MaxPlayers)
	if spec.GamePasswordRef != nil {
		settings["game_password"] = secrets.GamePassword
	}
	setBool(settings, "require_user_verification", spec.RequireUserVerification)

	if spec.Visibility != nil {
		visibility := map[string]any{}
		setBool(visibility, "public", spec.Visibility.Public)
		setBool(visibility, "lan", spec.Visibility.Lan)
		if len(visibility) > 0 {
			settings["visibility"] = visibility
		}
	}

	setAllowCommands(settings, "allow_commands", spec.AllowCommands)
}

// renderAutoSave writes the autosave fields.
func renderAutoSave(settings map[string]any, spec *gamesv1alpha1.AutoSaveSpec) {
	if spec == nil {
		return
	}

	setInt32(settings, "autosave_interval", spec.Interval)
	setInt32(settings, "autosave_slots", spec.Slots)
	setBool(settings, "non_blocking_saving", spec.NonBlockingSaving)
	setBool(settings, "autosave_only_on_server", spec.OnlyOnServer)
}

// renderPlayerManagement writes the player management fields.
func renderPlayerManagement(
	settings map[string]any,
	spec *gamesv1alpha1.PlayerManagementSpec,
) {
	if spec == nil {
		return
	}

	setInt32(settings, "afk_autokick_interval", spec.AfkAutokickInterval)
	setBool(settings, "auto_pause", spec.AutoPauseWhenNoPlayers)
	setBool(settings, "only_admins_can_pause_the_game", spec.OnlyAdminsCanPause)
	setBool(settings, "ignore_player_limit_for_returning_players",
		spec.IgnorePlayerLimitForReturningPlayers)
	setInt32(settings, "max_upload_slots", spec.MaxUploadSlots)
	setInt32(settings, "max_upload_in_kilobytes_per_second",
		spec.MaxUploadKilobytesPerSecond)
	setInt32(settings, "minimum_latency_in_ticks", spec.MinimumLatencyInTicks)
	setInt32(settings, "max_heartbeats_per_second", spec.MaxHeartbeatsPerSecond)
}

// renderAuthentication writes the factorio.com account fields.
func renderAuthentication(
	settings map[string]any,
	spec *gamesv1alpha1.AuthenticationSpec,
	secrets ServerSecretValues,
) {
	if spec == nil {
		return
	}

	setString(settings, "username", spec.Username)
	if spec.PasswordRef != nil {
		settings["password"] = secrets.Password
	}
	if spec.TokenRef != nil {
		settings["token"] = secrets.Token
	}
}
