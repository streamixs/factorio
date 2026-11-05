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
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

// FactorioServerSpec defines the desired state of FactorioServer
type FactorioServerSpec struct {

	// this is the version of the Factorio server that will be used to run the game server.
	// +optional
	// +kubebuilder:validation:Pattern=`^\d+\.\d+\.\d+$`
	// +kubebuilder:default="2.1.24"
	Version string `json:"version,omitempty"`

	// suspended stops the server without deleting it or its data. The
	// Deployment is scaled to zero, and setting the field back to false starts
	// the server again.
	// +optional
	// +kubebuilder:default=false
	Suspended bool `json:"suspended,omitempty"`

	// server defines the Factorio server settings rendered into
	// server-settings.json. When omitted, Factorio defaults apply.
	// +optional
	Server *ServerSettingsSpec `json:"server,omitempty"`

	// mapGenSettings defines the settings rendered into
	// map-gen-settings.json. These settings only apply when a new map is
	// generated.
	// +optional
	MapGenSettings *MapGenSettingsSpec `json:"mapGenSettings,omitempty"`

	// mapSettings defines the settings rendered into map-settings.json.
	// +optional
	MapSettings *MapSettingsSpec `json:"mapSettings,omitempty"`

	// storage defines the persistent volume holding the world saves and the
	// server identity. When omitted, a 10Gi volume is requested.
	// +optional
	Storage *StorageSpec `json:"storage,omitempty"`

	// service defines how the game port is exposed.
	// +optional
	Service *ServiceSpec `json:"service,omitempty"`
}

// StorageSpec defines the persistent storage of a FactorioServer.
type StorageSpec struct {
	// size is the requested size of the volume, for example "10Gi".
	// +optional
	// +kubebuilder:default="10Gi"
	// +kubebuilder:validation:Pattern=`^(\+|-)?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))(([KMGTPE]i)|[numkMGTPE]|([eE](\+|-)?(([0-9]+(\.[0-9]*)?)|(\.[0-9]+))))?$`
	Size string `json:"size,omitempty"`

	// storageClassName selects the StorageClass used for the volume. When
	// omitted, the cluster default StorageClass is used.
	// +optional
	StorageClassName *string `json:"storageClassName,omitempty"`
}

// ServiceSpec defines how the FactorioServer game port is exposed.
type ServiceSpec struct {
	// type selects how the service is exposed.
	// +optional
	// +kubebuilder:default=ClusterIP
	// +kubebuilder:validation:Enum=ClusterIP;NodePort;LoadBalancer
	Type corev1.ServiceType `json:"type,omitempty"`
}

// FactorioServerStatus defines the observed state of FactorioServer.
type FactorioServerStatus struct {
	// INSERT ADDITIONAL STATUS FIELD - define observed state of cluster
	// Important: Run "make" to regenerate code after modifying this file

	// For Kubernetes API conventions, see:
	// https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#typical-status-properties

	// conditions represent the current state of the FactorioServer resource.
	// Each condition has a unique type and reflects the status of a specific aspect of the resource.
	//
	// Standard condition types include:
	// - "Available": the resource is fully functional
	// - "Progressing": the resource is being created or updated
	// - "Degraded": the resource failed to reach or maintain its desired state
	//
	// The status of each condition is one of True, False, or Unknown.
	// +listType=map
	// +listMapKey=type
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Available",type=string,JSONPath=`.status.conditions[?(@.type=='Available')].status`
// +kubebuilder:printcolumn:name="Version",type=string,JSONPath=`.spec.version`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// FactorioServer is the Schema for the factorioservers API
type FactorioServer struct {
	metav1.TypeMeta `json:",inline"`

	// metadata is a standard object metadata
	// +optional
	metav1.ObjectMeta `json:"metadata,omitzero"`

	// spec defines the desired state of FactorioServer
	// +required
	Spec FactorioServerSpec `json:"spec"`

	// status defines the observed state of FactorioServer
	// +optional
	Status FactorioServerStatus `json:"status,omitzero"`
}

// +kubebuilder:object:root=true

// FactorioServerList contains a list of FactorioServer
type FactorioServerList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitzero"`
	Items           []FactorioServer `json:"items"`
}

func init() {
	SchemeBuilder.Register(func(s *runtime.Scheme) error {
		s.AddKnownTypes(SchemeGroupVersion, &FactorioServer{}, &FactorioServerList{})
		return nil
	})
}
