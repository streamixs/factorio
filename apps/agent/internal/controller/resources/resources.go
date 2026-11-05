package resources

import (
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

const (
	defaultCPURequest    = "500m"
	defaultCPULimit      = "2"
	defaultMemoryRequest = "1Gi"
	defaultMemoryLimit   = "4Gi"
)

// BuildResources returns the resolved resource requirements for the Factorio
// container. Empty fields fall back to defaults so older resources without the
// field keep a bounded footprint.
func BuildResources(
	server *gamesv1alpha1.FactorioServer,
) (corev1.ResourceRequirements, error) {
	cpuRequest := defaultCPURequest
	cpuLimit := defaultCPULimit
	memoryRequest := defaultMemoryRequest
	memoryLimit := defaultMemoryLimit

	if spec := server.Spec.Resources; spec != nil {
		if spec.CPURequest != "" {
			cpuRequest = spec.CPURequest
		}
		if spec.CPULimit != "" {
			cpuLimit = spec.CPULimit
		}
		if spec.MemoryRequest != "" {
			memoryRequest = spec.MemoryRequest
		}
		if spec.MemoryLimit != "" {
			memoryLimit = spec.MemoryLimit
		}
	}

	cpuRequestQuantity, err := parseQuantity("cpu request", cpuRequest)
	if err != nil {
		return corev1.ResourceRequirements{}, err
	}
	cpuLimitQuantity, err := parseQuantity("cpu limit", cpuLimit)
	if err != nil {
		return corev1.ResourceRequirements{}, err
	}
	memoryRequestQuantity, err := parseQuantity("memory request", memoryRequest)
	if err != nil {
		return corev1.ResourceRequirements{}, err
	}
	memoryLimitQuantity, err := parseQuantity("memory limit", memoryLimit)
	if err != nil {
		return corev1.ResourceRequirements{}, err
	}

	if cpuLimitQuantity.Cmp(cpuRequestQuantity) < 0 {
		return corev1.ResourceRequirements{}, fmt.Errorf(
			"cpu limit %q is lower than request %q", cpuLimit, cpuRequest)
	}
	if memoryLimitQuantity.Cmp(memoryRequestQuantity) < 0 {
		return corev1.ResourceRequirements{}, fmt.Errorf(
			"memory limit %q is lower than request %q", memoryLimit, memoryRequest)
	}

	return corev1.ResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    cpuRequestQuantity,
			corev1.ResourceMemory: memoryRequestQuantity,
		},
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    cpuLimitQuantity,
			corev1.ResourceMemory: memoryLimitQuantity,
		},
	}, nil
}

func parseQuantity(field, value string) (resource.Quantity, error) {
	quantity, err := resource.ParseQuantity(value)
	if err != nil {
		return resource.Quantity{}, fmt.Errorf("parse %s %q: %w", field, value, err)
	}
	if quantity.Sign() < 0 {
		return resource.Quantity{}, fmt.Errorf("%s %q must not be negative",
			field, value)
	}
	return quantity, nil
}
