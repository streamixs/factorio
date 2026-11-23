package resources

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"path"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

const (
	// RconPasswordKey is the key holding the RCON password in the generated
	// Secret and the file Factorio reads from its config directory.
	RconPasswordKey = "rconpw"

	// RconPasswordHashAnnotation records a digest of the RCON password on the
	// pod template, so rotating the Secret rolls the server. The password is
	// never written to the annotation.
	RconPasswordHashAnnotation = "games.dev.streamixs.com/rcon-password-hash"

	rconSecretSuffix = "-rcon"
	rconPort         = 27015
	// rconName is the name shared by the RCON container port, volume and mount.
	rconName = "rcon"
)

// RconSecretName returns the name of the Secret holding the RCON password.
func RconSecretName(server *gamesv1alpha1.FactorioServer) string {
	return server.Name + rconSecretSuffix
}

// GenerateRconPassword returns a random password suitable for the RCON
// protocol.
func GenerateRconPassword() (string, error) {
	buffer := make([]byte, 18)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

// BuildRconSecret builds the Secret mounted at config/rconpw. The image uses
// this file when it starts the server, so the password is stable and known to
// the API.
func BuildRconSecret(
	server *gamesv1alpha1.FactorioServer,
	password string,
) *corev1.Secret {
	return &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      RconSecretName(server),
			Namespace: server.Namespace,
			Labels:    labelsFor(server),
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			RconPasswordKey: []byte(password),
		},
	}
}

func rconPasswordHash(password string) string {
	sum := sha256.Sum256([]byte(password))
	return hex.EncodeToString(sum[:])
}

func rconVolumeFor(server *gamesv1alpha1.FactorioServer) corev1.Volume {
	return corev1.Volume{
		Name: rconName,
		VolumeSource: corev1.VolumeSource{
			Secret: &corev1.SecretVolumeSource{
				SecretName: RconSecretName(server),
				Items: []corev1.KeyToPath{
					{Key: RconPasswordKey, Path: RconPasswordKey},
				},
			},
		},
	}
}

func rconMount() corev1.VolumeMount {
	return corev1.VolumeMount{
		Name:      rconName,
		MountPath: path.Join(configDir, RconPasswordKey),
		SubPath:   RconPasswordKey,
		ReadOnly:  true,
	}
}
