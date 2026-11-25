package resources

import (
	corev1 "k8s.io/api/core/v1"
)

const (
	// savesSidecarContainer serves the saves Factorio writes over HTTP, so the
	// API can list, download and restore them. It does not copy them.
	savesSidecarContainer = "saves"
	savesHTTPPort         = 8080
	savesImage            = "busybox:1.36"
	savesDir              = "/factorio/saves"
	savesIndexInterval    = 30
)

// savesScript writes an index of the zip saves in the saves directory and
// serves that directory on the pod network. Factorio owns the saves
// directory: the sidecar only adds index.txt and .index.tmp, which Factorio
// ignores. The index loop is the container's main process and supervises
// httpd in the background, so neither dies silently. SIGTERM shuts both down
// immediately, otherwise the pod would wait for terminationGracePeriodSeconds.
const savesScript = `set -u

httpd_supervisor_pid=""
shutdown() {
  if [ -n "$httpd_supervisor_pid" ]; then
    kill "$httpd_supervisor_pid" 2>/dev/null || true
  fi
  exit 0
}
trap shutdown TERM INT

(
  while true; do
    httpd -f -p 8080 -h /factorio/saves
    sleep 5
  done
) &
httpd_supervisor_pid=$!

echo "saves sidecar started"
while true; do
  tmp=/factorio/saves/.index.tmp
  : > "$tmp"
  for f in /factorio/saves/*.zip; do
    [ -e "$f" ] || continue
    case "$f" in *.tmp.zip) continue ;; esac
    name=${f##*/}
    size=$(wc -c < "$f" 2>/dev/null || echo 0)
    mtime=$(stat -c %Y "$f" 2>/dev/null || echo 0)
    printf '%s %s %s\n' "$name" "$size" "$mtime" >> "$tmp"
  done
  mv "$tmp" /factorio/saves/index.txt
  sleep 30 &
  wait $! || true
done
`

// savesContainerFileServer returns the sidecar serving the Factorio saves.
// The data volume is mounted read-write because the sidecar writes the index
// next to the saves; it never modifies a save.
func savesContainerFileServer() corev1.Container {
	runAsUser := int64(serverUserID)
	runAsGroup := int64(serverUserID)
	runAsNonRoot := true
	readOnlyRoot := true
	allowPrivilegeEscalation := false

	return corev1.Container{
		Name:    savesSidecarContainer,
		Image:   savesImage,
		Command: []string{"sh", "-c", savesScript},
		Ports: []corev1.ContainerPort{
			{Name: "http", ContainerPort: savesHTTPPort},
		},
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
				Drop: []corev1.Capability{"ALL"},
			},
		},
	}
}

// LegacyBackupPersistentVolumeClaimName returns the name of the claim used by
// the removed copy-based backup feature. The controller deletes it when it
// encounters an existing FactorioServer.
func LegacyBackupPersistentVolumeClaimName(name string) string {
	return name + "-backups"
}
