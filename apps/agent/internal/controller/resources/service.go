package resources

import (
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/equality"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

// BuildService builds the Service exposing the game port.
func BuildService(server *gamesv1alpha1.FactorioServer) *corev1.Service {
	serviceType := corev1.ServiceTypeClusterIP
	if server.Spec.Service != nil && server.Spec.Service.Type != "" {
		serviceType = server.Spec.Service.Type
	}

	labels := labelsFor(server)

	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      server.Name,
			Namespace: server.Namespace,
			Labels:    labels,
		},
		Spec: corev1.ServiceSpec{
			Type:     serviceType,
			Selector: labels,
			Ports: []corev1.ServicePort{
				{
					Name:       "game",
					Protocol:   corev1.ProtocolUDP,
					Port:       gamePort,
					TargetPort: intstr.FromInt32(gamePort),
				},
			},
		},
	}
}

// NeedsServiceUpdate reports whether existing differs from desired on a field
// the controller manages. The allocated nodePort is ignored, since it is set
// by the API server for NodePort and LoadBalancer services.
func NeedsServiceUpdate(existing, desired *corev1.Service) bool {
	if existing.Spec.Type != desired.Spec.Type {
		return true
	}

	if !equality.Semantic.DeepEqual(existing.Spec.Selector,
		desired.Spec.Selector) {
		return true
	}

	return !servicePortsEqual(existing.Spec.Ports, desired.Spec.Ports)
}

// UpdateService applies the mutable parts of desired to existing.
func UpdateService(existing, desired *corev1.Service) {
	existing.Spec.Type = desired.Spec.Type
	existing.Spec.Selector = desired.Spec.Selector

	if !servicePortsEqual(existing.Spec.Ports, desired.Spec.Ports) {
		existing.Spec.Ports = desired.Spec.Ports
	}
}

func servicePortsEqual(existing, desired []corev1.ServicePort) bool {
	if len(existing) != len(desired) {
		return false
	}

	for i := range desired {
		current := existing[i]
		wanted := desired[i]

		if current.Name != wanted.Name ||
			current.Protocol != wanted.Protocol ||
			current.Port != wanted.Port ||
			current.TargetPort != wanted.TargetPort {
			return false
		}
	}

	return true
}
