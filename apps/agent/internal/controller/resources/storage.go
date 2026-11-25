package resources

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

const defaultStorageSize = "10Gi"

// KeepPVCAnnotation marks a claim intentionally detached from a deleted
// FactorioServer. The controller adopts it when a server with the same name is
// created again.
const KeepPVCAnnotation = "games.dev.streamixs.com/keep-pvc"

// KeepPVCPendingAnnotation is set on the FactorioServer while the API detaches
// its claim before deletion. The controller must not adopt the claim during
// that window.
const KeepPVCPendingAnnotation = "games.dev.streamixs.com/keep-pvc-pending"

// PersistentVolumeClaimName returns the name of the claim holding the server
// data.
func PersistentVolumeClaimName(server *gamesv1alpha1.FactorioServer) string {
	return server.Name + "-data"
}

// BuildPersistentVolumeClaim builds the claim mounted at /factorio. It holds
// the world saves, mods, server identity and the writable config directory.
func BuildPersistentVolumeClaim(
	server *gamesv1alpha1.FactorioServer,
) (*corev1.PersistentVolumeClaim, error) {
	size := defaultStorageSize
	var storageClassName *string

	if server.Spec.Storage != nil {
		if server.Spec.Storage.Size != "" {
			size = server.Spec.Storage.Size
		}
		storageClassName = server.Spec.Storage.StorageClassName
	}

	quantity, err := resource.ParseQuantity(size)
	if err != nil {
		return nil, fmt.Errorf("parse storage size %q: %w", size, err)
	}

	return &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      PersistentVolumeClaimName(server),
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
