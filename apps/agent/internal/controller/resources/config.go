package resources

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	"github.com/streamixs/factorio/apps/agent/internal/config"
)

// PodTemplateHashAnnotation records a hash of the desired pod template and the
// rendered settings, so that any managed change triggers a rollout.
const PodTemplateHashAnnotation = "games.dev.streamixs.com/pod-template-hash"

// ConfigFiles holds the rendered settings files. A nil field means the
// corresponding section is not set in the custom resource, so no object is
// created and nothing is mounted for it.
type ConfigFiles struct {
	ServerSettings []byte
	MapGenSettings []byte
	MapSettings    []byte
}

// Hash returns a stable digest of the files that are present. It changes when
// a file appears, disappears or changes content.
func (f ConfigFiles) Hash() string {
	var data []byte
	data = appendHashPart(data, config.ServerSettingsFile, f.ServerSettings)
	data = appendHashPart(data, config.MapGenSettingsFile, f.MapGenSettings)
	data = appendHashPart(data, config.MapSettingsFile, f.MapSettings)

	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func appendHashPart(data []byte, name string, content []byte) []byte {
	if content == nil {
		return append(data, name+":absent\n"...)
	}

	data = append(data, name...)
	data = append(data, ':')
	data = append(data, strconv.Itoa(len(content))...)
	data = append(data, ':')
	data = append(data, content...)
	return append(data, '\n')
}

// ServerSettingsSecretName returns the name of the Secret holding
// server-settings.json for server.
func ServerSettingsSecretName(server *gamesv1alpha1.FactorioServer) string {
	return server.Name + "-server-settings"
}

// MapGenSettingsConfigMapName returns the name of the ConfigMap holding
// map-gen-settings.json for server.
func MapGenSettingsConfigMapName(server *gamesv1alpha1.FactorioServer) string {
	return server.Name + "-map-gen-settings"
}

// MapSettingsConfigMapName returns the name of the ConfigMap holding
// map-settings.json for server.
func MapSettingsConfigMapName(server *gamesv1alpha1.FactorioServer) string {
	return server.Name + "-map-settings"
}

// EffectiveSettingsConfigMapName returns the name of the ConfigMap exposing
// the default and effective specifications to the API and the UI.
func EffectiveSettingsConfigMapName(server *gamesv1alpha1.FactorioServer) string {
	return server.Name + "-effective-settings"
}

// Keys used in the effective settings ConfigMap.
const (
	DefaultsSettingsKey  = "defaults.json"
	EffectiveSettingsKey = "effective.json"
)

// BuildEffectiveSettingsConfigMap builds the ConfigMap holding the default
// and effective server specifications.
func BuildEffectiveSettingsConfigMap(
	server *gamesv1alpha1.FactorioServer,
	defaults, effective []byte,
) *corev1.ConfigMap {
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      EffectiveSettingsConfigMapName(server),
			Namespace: server.Namespace,
			Labels:    labelsFor(server),
		},
		Data: map[string]string{
			DefaultsSettingsKey:  string(defaults),
			EffectiveSettingsKey: string(effective),
		},
	}
}

// BuildServerSettingsSecret builds the Secret holding server-settings.json.
// A Secret is used because the file can contain the game password, the
// factorio.com account password or its API token.
func BuildServerSettingsSecret(
	server *gamesv1alpha1.FactorioServer,
	content []byte,
) *corev1.Secret {
	return &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ServerSettingsSecretName(server),
			Namespace: server.Namespace,
			Labels:    labelsFor(server),
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			config.ServerSettingsFile: content,
		},
	}
}

// BuildMapGenSettingsConfigMap builds the ConfigMap holding
// map-gen-settings.json.
func BuildMapGenSettingsConfigMap(
	server *gamesv1alpha1.FactorioServer,
	content []byte,
) *corev1.ConfigMap {
	return buildConfigMap(server, MapGenSettingsConfigMapName(server),
		config.MapGenSettingsFile, content)
}

// BuildMapSettingsConfigMap builds the ConfigMap holding map-settings.json.
func BuildMapSettingsConfigMap(
	server *gamesv1alpha1.FactorioServer,
	content []byte,
) *corev1.ConfigMap {
	return buildConfigMap(server, MapSettingsConfigMapName(server),
		config.MapSettingsFile, content)
}

func buildConfigMap(
	server *gamesv1alpha1.FactorioServer,
	name, key string,
	content []byte,
) *corev1.ConfigMap {
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: server.Namespace,
			Labels:    labelsFor(server),
		},
		Data: map[string]string{
			key: string(content),
		},
	}
}
