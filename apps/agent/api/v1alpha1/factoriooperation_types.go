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
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

// OperationType is the action performed by a FactorioOperation.
// +kubebuilder:validation:Enum=Restore;Import
type OperationType string

const (
	// OperationRestore installs a save already present in the data volume.
	OperationRestore OperationType = "Restore"

	// OperationImport downloads an uploaded save and installs it.
	OperationImport OperationType = "Import"
)

// Operation phases. Pending and Suspending are transient, Running means the
// Job is executing, Completed and Failed are terminal.
const (
	OperationPhasePending    = "Pending"
	OperationPhaseSuspending = "Suspending"
	OperationPhaseRunning    = "Running"
	OperationPhaseCompleted  = "Completed"
	OperationPhaseFailed     = "Failed"
)

// FactorioOperationSpec defines the operation to run on a server.
type FactorioOperationSpec struct {
	// serverName is the FactorioServer this operation applies to.
	// +kubebuilder:validation:MinLength=1
	ServerName string `json:"serverName"`

	// type is the action to perform.
	Type OperationType `json:"type"`

	// saveFile is the save to install for a Restore operation.
	// +optional
	SaveFile string `json:"saveFile,omitempty"`

	// importUrl is the one-time URL the Job downloads for an Import operation.
	// +optional
	ImportURL string `json:"importUrl,omitempty"`
}

// FactorioOperationStatus defines the observed state of a FactorioOperation.
type FactorioOperationStatus struct {
	// phase is the current step of the operation.
	// +optional
	Phase string `json:"phase,omitempty"`

	// message is a human-readable description of the current step.
	// +optional
	Message string `json:"message,omitempty"`

	// jobName is the Job created by the operation.
	// +optional
	JobName string `json:"jobName,omitempty"`

	// wasSuspended records whether the server was already stopped before the
	// operation. The controller only restarts servers it stopped itself.
	// +optional
	WasSuspended bool `json:"wasSuspended,omitempty"`

	// startedAt is when the operation started.
	// +optional
	StartedAt *metav1.Time `json:"startedAt,omitempty"`

	// completedAt is when the operation reached a terminal phase.
	// +optional
	CompletedAt *metav1.Time `json:"completedAt,omitempty"`

	// conditions represent the current state of the operation.
	// +listType=map
	// +listMapKey=type
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:shortName=fop
// +kubebuilder:printcolumn:name="Server",type=string,JSONPath=`.spec.serverName`
// +kubebuilder:printcolumn:name="Type",type=string,JSONPath=`.spec.type`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// FactorioOperation is the Schema for the factoriooperations API.
type FactorioOperation struct {
	metav1.TypeMeta `json:",inline"`

	// metadata is a standard object metadata
	// +optional
	metav1.ObjectMeta `json:"metadata,omitzero"`

	// spec defines the requested operation.
	// +required
	Spec FactorioOperationSpec `json:"spec"`

	// status defines the observed state of the operation.
	// +optional
	Status FactorioOperationStatus `json:"status,omitzero"`
}

// +kubebuilder:object:root=true

// FactorioOperationList contains a list of FactorioOperation.
type FactorioOperationList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitzero"`
	Items           []FactorioOperation `json:"items"`
}

func init() {
	SchemeBuilder.Register(func(s *runtime.Scheme) error {
		s.AddKnownTypes(SchemeGroupVersion,
			&FactorioOperation{}, &FactorioOperationList{})
		return nil
	})
}
