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
	corev1 "k8s.io/api/core/v1"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
)

// ServerSettingsSpec defines the settings rendered into Factorio's
// server-settings.json file.
type ServerSettingsSpec struct {

	// identity defines how the server is presented in the server list.
	// +optional
	Identity *ServerIdentitySpec `json:"identity,omitempty"`

	// access defines who may connect and what they may do.
	// +optional
	Access *AccessControlSpec `json:"access,omitempty"`

	// autoSave defines how the server saves the game.
	// +optional
	AutoSave *AutoSaveSpec `json:"autoSave,omitempty"`

	// playerManagement defines how players are managed while connected.
	// +optional
	PlayerManagement *PlayerManagementSpec `json:"playerManagement,omitempty"`

	// authentication defines the factorio.com account used by the server.
	// +optional
	Authentication *AuthenticationSpec `json:"authentication,omitempty"`

	// raw contains additional server-settings.json keys that are not exposed
	// as typed fields. A key set both here and through a typed field is
	// rejected to avoid ambiguity.
	// +optional
	// +kubebuilder:pruning:PreserveUnknownFields
	Raw *apiextensionsv1.JSON `json:"raw,omitempty"`
}

// ServerIdentitySpec defines the server's identity in the server list.
type ServerIdentitySpec struct {

	// name is the name displayed in the server list. Maps to name.
	// +optional
	// +kubebuilder:validation:MinLength=1
	// +kubebuilder:validation:MaxLength=64
	Name *string `json:"name,omitempty"`

	// description is the description displayed in the server list.
	// Maps to description.
	// +optional
	Description *string `json:"description,omitempty"`

	// tags are the tags displayed in the server list. Maps to tags.
	// +optional
	// +listType=set
	Tags []string `json:"tags,omitempty"`
}

// AccessControlSpec defines who may connect to the server.
type AccessControlSpec struct {

	// maxPlayers is the maximum number of players allowed to connect at the
	// same time. A value of 0 means no limit. Maps to max_players.
	// +optional
	// +kubebuilder:validation:Minimum=0
	MaxPlayers *int32 `json:"maxPlayers,omitempty"`

	// gamePasswordRef references the Secret key holding the password players
	// must enter to join. Maps to game_password.
	// +optional
	GamePasswordRef *corev1.SecretKeySelector `json:"gamePasswordRef,omitempty"`

	// requireUserVerification requires players to have a verified factorio.com
	// account. Maps to require_user_verification.
	// +optional
	RequireUserVerification *bool `json:"requireUserVerification,omitempty"`

	// visibility controls how the server is advertised.
	// Maps to visibility.
	// +optional
	Visibility *VisibilitySpec `json:"visibility,omitempty"`

	// allowCommands controls whether players may run console commands.
	// Maps to allow_commands.
	// +optional
	AllowCommands *AllowCommands `json:"allowCommands,omitempty"`
}

// VisibilitySpec defines where the server is advertised.
type VisibilitySpec struct {

	// public advertises the server in the public server list.
	// Maps to visibility.public.
	// +optional
	Public *bool `json:"public,omitempty"`

	// lan advertises the server on the local network.
	// Maps to visibility.lan.
	// +optional
	Lan *bool `json:"lan,omitempty"`
}

// AllowCommands controls whether players may run console commands.
// Maps to allow_commands.
// +kubebuilder:validation:Enum="true";"false";"admins-only"
type AllowCommands string

const (
	// AllowCommandsEnabled lets every player run console commands.
	AllowCommandsEnabled AllowCommands = "true"

	// AllowCommandsDisabled forbids console commands for every player.
	AllowCommandsDisabled AllowCommands = "false"

	// AllowCommandsAdminsOnly restricts console commands to administrators.
	AllowCommandsAdminsOnly AllowCommands = "admins-only"
)

// AutoSaveSpec defines how the server saves the game.
type AutoSaveSpec struct {

	// interval is the time between autosaves, in minutes. A value of 0
	// disables autosaving. Maps to autosave_interval.
	// +optional
	// +kubebuilder:validation:Minimum=0
	Interval *int32 `json:"interval,omitempty"`

	// slots is the number of autosave slots to rotate through.
	// Maps to autosave_slots.
	// +optional
	// +kubebuilder:validation:Minimum=1
	Slots *int32 `json:"slots,omitempty"`

	// nonBlockingSaving saves without blocking the game loop. Linux only.
	// Maps to non_blocking_saving.
	// +optional
	NonBlockingSaving *bool `json:"nonBlockingSaving,omitempty"`

	// onlyOnServer keeps autosaves on the server instead of sending them to
	// clients. Maps to autosave_only_on_server.
	// +optional
	OnlyOnServer *bool `json:"onlyOnServer,omitempty"`
}

// PlayerManagementSpec defines how players are managed while connected.
type PlayerManagementSpec struct {

	// afkAutokickInterval is the time in minutes after which an AFK player is
	// kicked. A value of 0 disables AFK kicks. Maps to afk_autokick_interval.
	// +optional
	// +kubebuilder:validation:Minimum=0
	AfkAutokickInterval *int32 `json:"afkAutokickInterval,omitempty"`

	// autoPauseWhenNoPlayers pauses the game when no players are connected.
	// Maps to auto_pause.
	// +optional
	AutoPauseWhenNoPlayers *bool `json:"autoPauseWhenNoPlayers,omitempty"`

	// onlyAdminsCanPause restricts pausing to administrators.
	// Maps to only_admins_can_pause_the_game.
	// +optional
	OnlyAdminsCanPause *bool `json:"onlyAdminsCanPause,omitempty"`

	// ignorePlayerLimitForReturningPlayers lets returning players join even
	// when the server is full.
	// Maps to ignore_player_limit_for_returning_players.
	// +optional
	IgnorePlayerLimitForReturningPlayers *bool `json:"ignorePlayerLimitForReturningPlayers,omitempty"`

	// maxUploadSlots is the maximum number of concurrent upload slots.
	// Maps to max_upload_slots.
	// +optional
	// +kubebuilder:validation:Minimum=0
	MaxUploadSlots *int32 `json:"maxUploadSlots,omitempty"`

	// maxUploadKilobytesPerSecond is the upload rate limit in kilobytes per
	// second. A value of 0 means no limit.
	// Maps to max_upload_in_kilobytes_per_second.
	// +optional
	// +kubebuilder:validation:Minimum=0
	MaxUploadKilobytesPerSecond *int32 `json:"maxUploadKilobytesPerSecond,omitempty"`

	// minimumLatencyInTicks is the minimum latency in ticks applied to all
	// players. Maps to minimum_latency_in_ticks.
	// +optional
	// +kubebuilder:validation:Minimum=0
	MinimumLatencyInTicks *int32 `json:"minimumLatencyInTicks,omitempty"`

	// maxHeartbeatsPerSecond is the maximum number of heartbeats per second.
	// Maps to max_heartbeats_per_second.
	// +optional
	// +kubebuilder:validation:Minimum=0
	MaxHeartbeatsPerSecond *int32 `json:"maxHeartbeatsPerSecond,omitempty"`
}

// AuthenticationSpec defines the factorio.com account used by the server.
type AuthenticationSpec struct {

	// username is the factorio.com account name used by the server.
	// Maps to username.
	// +optional
	Username *string `json:"username,omitempty"`

	// passwordRef references the Secret key holding the factorio.com account
	// password. Prefer tokenRef when possible. Maps to password.
	// +optional
	PasswordRef *corev1.SecretKeySelector `json:"passwordRef,omitempty"`

	// tokenRef references the Secret key holding the factorio.com API token.
	// Maps to token.
	// +optional
	TokenRef *corev1.SecretKeySelector `json:"tokenRef,omitempty"`
}
