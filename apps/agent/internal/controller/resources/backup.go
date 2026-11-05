package resources

import (
	"fmt"
	"strconv"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

const (
	defaultBackupSize            = "10Gi"
	defaultBackupIntervalMinutes = int32(60)
	defaultBackupRetention       = int32(10)

	backupVolumeName = "backups"
	backupDir        = "/backups"
	backupContainer  = "backup"
	backupHTTPPort   = 8080
	backupImage      = "busybox:1.36"
)

// backupScript copies the saves every INTERVAL_MINUTES, prunes files beyond
// RETENTION, writes an index consumed by the API, and serves the directory
// over HTTP inside the pod network.
const backupScript = `set -u
mkdir -p /backups
write_index() {
  tmp="/backups/.index.tmp"
  : > "$tmp"
  for f in /backups/*.zip; do
    [ -e "$f" ] || continue
    case "$f" in *.tmp.zip) continue ;; esac
    name=${f##*/}
    size=$(wc -c < "$f" 2>/dev/null || echo 0)
    mtime=$(stat -c %Y "$f" 2>/dev/null || echo 0)
    printf '%s %s %s\n' "$name" "$size" "$mtime" >> "$tmp"
  done
  mv "$tmp" /backups/index.txt
}
(
  while true; do
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    for save in /factorio/saves/*.zip; do
      [ -e "$save" ] || continue
      case "$save" in *.tmp.zip) continue ;; esac
      base=${save##*/}
      base=${base%.zip}
      cp "$save" "/backups/.${base}-${stamp}.tmp"
      mv "/backups/.${base}-${stamp}.tmp" "/backups/${base}-${stamp}.zip"
    done
    ls -1t /backups/*.zip 2>/dev/null | tail -n +$((RETENTION + 1)) | while read -r old; do
      rm -f "$old"
    done
    write_index
    sleep $((INTERVAL_MINUTES * 60))
  done
) &
exec httpd -f -p 8080 -h /backups
`

// BackupEnabled reports whether the backup sidecar and volume are enabled.
// Backups are enabled when spec.backup is omitted.
func BackupEnabled(server *gamesv1alpha1.FactorioServer) bool {
	backup := server.Spec.Backup
	return backup == nil || backup.Enabled == nil || *backup.Enabled
}

// BackupPersistentVolumeClaimName returns the name of the backup volume.
func BackupPersistentVolumeClaimName(
	server *gamesv1alpha1.FactorioServer,
) string {
	return server.Name + "-backups"
}

// BuildBackupPersistentVolumeClaim builds the claim holding timestamped save
// copies.
func BuildBackupPersistentVolumeClaim(
	server *gamesv1alpha1.FactorioServer,
) (*corev1.PersistentVolumeClaim, error) {
	size := defaultBackupSize
	if server.Spec.Backup != nil && server.Spec.Backup.Size != "" {
		size = server.Spec.Backup.Size
	}

	var storageClassName *string
	if server.Spec.Storage != nil {
		storageClassName = server.Spec.Storage.StorageClassName
	}

	quantity, err := resource.ParseQuantity(size)
	if err != nil {
		return nil, fmt.Errorf("parse backup size %q: %w", size, err)
	}

	return &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      BackupPersistentVolumeClaimName(server),
			Namespace: server.Namespace,
			Labels:    labelsFor(server),
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{
				corev1.ReadWriteOnce,
			},
			StorageClassName: storageClassName,
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: quantity,
				},
			},
		},
	}, nil
}

func backupVolumeFor(server *gamesv1alpha1.FactorioServer) corev1.Volume {
	return corev1.Volume{
		Name: backupVolumeName,
		VolumeSource: corev1.VolumeSource{
			PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
				ClaimName: BackupPersistentVolumeClaimName(server),
			},
		},
	}
}

func backupContainerFor(server *gamesv1alpha1.FactorioServer) corev1.Container {
	runAsUser := int64(serverUserID)
	runAsGroup := int64(serverUserID)
	runAsNonRoot := true
	readOnlyRoot := true
	allowPrivilegeEscalation := false

	return corev1.Container{
		Name:    backupContainer,
		Image:   backupImage,
		Command: []string{"sh", "-c", backupScript},
		Env: []corev1.EnvVar{
			{
				Name:  "INTERVAL_MINUTES",
				Value: strconv.Itoa(int(backupIntervalMinutes(server))),
			},
			{
				Name:  "RETENTION",
				Value: strconv.Itoa(int(backupRetention(server))),
			},
		},
		Ports: []corev1.ContainerPort{
			{Name: "http", ContainerPort: backupHTTPPort},
		},
		VolumeMounts: []corev1.VolumeMount{
			{Name: dataVolume, MountPath: dataDir, ReadOnly: true},
			{Name: backupVolumeName, MountPath: backupDir},
		},
		SecurityContext: &corev1.SecurityContext{
			RunAsUser:                &runAsUser,
			RunAsGroup:               &runAsGroup,
			RunAsNonRoot:             &runAsNonRoot,
			ReadOnlyRootFilesystem:   &readOnlyRoot,
			AllowPrivilegeEscalation: &allowPrivilegeEscalation,
			Capabilities: &corev1.Capabilities{
				Drop: []corev1.Capability{"ALL"},
			},
		},
	}
}

func backupIntervalMinutes(server *gamesv1alpha1.FactorioServer) int32 {
	if server.Spec.Backup != nil && server.Spec.Backup.IntervalMinutes != nil {
		return *server.Spec.Backup.IntervalMinutes
	}
	return defaultBackupIntervalMinutes
}

func backupRetention(server *gamesv1alpha1.FactorioServer) int32 {
	if server.Spec.Backup != nil && server.Spec.Backup.Retention != nil {
		return *server.Spec.Backup.Retention
	}
	return defaultBackupRetention
}
