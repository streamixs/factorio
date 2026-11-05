package resources

import (
	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/equality"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const gamePort = 34197

func labelsFor(server *gamesv1alpha1.FactorioServer) map[string]string {
	return map[string]string{
		"app":                        server.Name,
		"app.kubernetes.io/name":     "factorio",
		"app.kubernetes.io/instance": server.Name,
	}
}

func BuildDeployment(factorioServer *gamesv1alpha1.FactorioServer) appsv1.Deployment {

	replicas := int32(1)

	labels := labelsFor(factorioServer)

	deployment := appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      factorioServer.Name,
			Namespace: factorioServer.Namespace,
			Labels:    labels,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: labels,
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: labels,
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "factorio",
							Image: "factoriotools/factorio:" + factorioServer.Spec.Version,
							Ports: []corev1.ContainerPort{
								{
									Name:          "game",
									ContainerPort: gamePort,
									Protocol:      corev1.ProtocolUDP,
								},
							},
						},
					},
				},
			},
		},
	}

	return deployment
}

func NeedsUpdate(existing, desired *appsv1.Deployment) bool {
	if !equality.Semantic.DeepEqual(existing.Spec.Replicas, desired.Spec.Replicas) {
		return true
	}

	existingContainers := existing.Spec.Template.Spec.Containers
	desiredContainers := desired.Spec.Template.Spec.Containers

	if len(existingContainers) != len(desiredContainers) {
		return true
	}

	for i := range desiredContainers {
		if existingContainers[i].Name != desiredContainers[i].Name {
			return true
		}

		if existingContainers[i].Image != desiredContainers[i].Image {
			return true
		}
	}

	return false
}

func UpdateDeployment(existing, desired *appsv1.Deployment) {
	existing.Spec.Replicas = desired.Spec.Replicas
	existing.Spec.Template.Spec.Containers = desired.Spec.Template.Spec.Containers
}
