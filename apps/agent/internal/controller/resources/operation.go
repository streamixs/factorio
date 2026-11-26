package resources

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

const (
	operationContainer      = "operation"
	operationImage          = "busybox:1.36"
	operationUserID         = 845
	targetSaveName          = mainSaveFile
	maxJobNameLength        = 63
	operationDeadline       = int64(900)
	retainedOperationCopies = 3
)

// operationPruneSaves removes the oldest pre-restore/pre-import copies. The
// platform save names contain no whitespace, so the unquoted pattern is
// deliberately expanded as a glob by the shell.
var operationPruneSaves = fmt.Sprintf(`

prune_saves() {
  pattern="$1"
  count=0
  for file in $(ls -1t $pattern 2>/dev/null || true); do
    count=$((count + 1))
    if [ "$count" -gt %d ]; then
      rm -f "$file"
    fi
  done
}
`, retainedOperationCopies)

var operationRestoreScript = `set -eu
mkdir -p /factorio/saves
if [ -f "/factorio/saves/$TARGET_SAVE" ]; then
  cp -p "/factorio/saves/$TARGET_SAVE" "/factorio/saves/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)-$TARGET_SAVE"
fi
` + operationPruneSaves + `if [ "$SAVE_FILE" != "$TARGET_SAVE" ]; then
  cp "/factorio/saves/$SAVE_FILE" "/factorio/saves/$TARGET_SAVE"
fi
touch "/factorio/saves/$TARGET_SAVE"
prune_saves "/factorio/saves/pre-restore-*.zip"
`

var operationImportScript = `set -eu
mkdir -p /factorio/saves
target="/factorio/saves/$TARGET_SAVE"
tmp="/factorio/saves/.import.tmp.zip"
trap 'rm -f "$tmp"' EXIT
if [ -f "$target" ]; then
  cp -p "$target" "/factorio/saves/pre-import-$(date -u +%Y%m%dT%H%M%SZ)-$TARGET_SAVE"
fi
wget -q -O "$tmp" "$IMPORT_URL"
mv "$tmp" "$target"
touch "$target"
` + operationPruneSaves + `prune_saves "/factorio/saves/pre-import-*.zip"
`

// OperationJobName returns the deterministic name of the Job for an
// operation. Determinism makes the controller idempotent across restarts, and
// the hash suffix keeps long server names from losing the random operation
// suffix and colliding.
func OperationJobName(operation *gamesv1alpha1.FactorioOperation) string {
	name := operation.Name + "-job"
	if len(name) <= maxJobNameLength {
		return name
	}

	sum := sha256.Sum256([]byte(operation.Name))
	suffix := "-" + hex.EncodeToString(sum[:4])
	base := strings.TrimRight(name[:maxJobNameLength-len(suffix)], "-")
	return base + suffix
}

func operationLabels(
	operation *gamesv1alpha1.FactorioOperation,
	server *gamesv1alpha1.FactorioServer,
) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name": "factorio-operation",
		"factorio.dev/server":    server.Name,
		"factorio.dev/operation": operation.Name,
	}
}

// BuildOperationJob builds the Job that installs the save on the data volume.
func BuildOperationJob(
	operation *gamesv1alpha1.FactorioOperation,
	server *gamesv1alpha1.FactorioServer,
) *batchv1.Job {
	runAsUser := int64(operationUserID)
	runAsGroup := int64(operationUserID)
	runAsNonRoot := true
	readOnlyRoot := true
	allowPrivilegeEscalation := false
	deadline := operationDeadline

	script := operationRestoreScript
	env := []corev1.EnvVar{
		{Name: "SAVE_FILE", Value: operation.Spec.SaveFile},
		{Name: "TARGET_SAVE", Value: targetSaveName},
	}
	if operation.Spec.Type == gamesv1alpha1.OperationImport {
		script = operationImportScript
		env = []corev1.EnvVar{
			{Name: "IMPORT_URL", Value: operation.Spec.ImportURL},
			{Name: "TARGET_SAVE", Value: targetSaveName},
		}
	}

	labels := operationLabels(operation, server)

	return &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      OperationJobName(operation),
			Namespace: operation.Namespace,
			Labels:    labels,
		},
		Spec: batchv1.JobSpec{
			BackoffLimit:          new(int32(1)),
			ActiveDeadlineSeconds: &deadline,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					AutomountServiceAccountToken: new(false),
					RestartPolicy:                corev1.RestartPolicyNever,
					SecurityContext: &corev1.PodSecurityContext{
						RunAsNonRoot: &runAsNonRoot,
						RunAsUser:    &runAsUser,
						RunAsGroup:   &runAsGroup,
						SeccompProfile: &corev1.SeccompProfile{
							Type: corev1.SeccompProfileTypeRuntimeDefault,
						},
					},
					Containers: []corev1.Container{
						{
							Name:    operationContainer,
							Image:   operationImage,
							Command: []string{"sh", "-c", script},
							Env:     env,
							VolumeMounts: []corev1.VolumeMount{
								{Name: dataVolume, MountPath: dataDir},
							},
							SecurityContext: &corev1.SecurityContext{
								RunAsUser:                &runAsUser,
								RunAsGroup:               &runAsGroup,
								RunAsNonRoot:             &runAsNonRoot,
								ReadOnlyRootFilesystem:   &readOnlyRoot,
								AllowPrivilegeEscalation: &allowPrivilegeEscalation,
								Capabilities: &corev1.Capabilities{
									Drop: []corev1.Capability{allCapabilities},
								},
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: dataVolume,
							VolumeSource: corev1.VolumeSource{
								PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
									ClaimName: PersistentVolumeClaimName(server),
								},
							},
						},
					},
				},
			},
		},
	}
}
