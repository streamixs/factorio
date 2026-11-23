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

package controller

import (
	"context"
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

// updateStatus derives the conditions from the current Deployment state.
func (r *FactorioServerReconciler) updateStatus(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
) error {
	var deployment appsv1.Deployment
	if err := r.Get(ctx, types.NamespacedName{
		Namespace: server.Namespace,
		Name:      server.Name,
	}, &deployment); err != nil {
		return fmt.Errorf("get deployment for status: %w", err)
	}

	replicas := int32(1)
	if deployment.Spec.Replicas != nil {
		replicas = *deployment.Spec.Replicas
	}

	if server.Spec.Suspended {
		changed := setSuspendedCondition(server, ConditionAvailable)
		changed = setSuspendedCondition(server, ConditionProgressing) || changed
		changed = setSuspendedCondition(server, ConditionDegraded) || changed

		if !changed {
			return nil
		}
		return r.Status().Update(ctx, server)
	}

	available := deployment.Status.AvailableReplicas >= replicas
	progressing := deployment.Status.ObservedGeneration < deployment.Generation ||
		deployment.Status.UpdatedReplicas < replicas ||
		deployment.Status.AvailableReplicas < replicas

	changed := setAvailableCondition(server, available)
	changed = setProgressingCondition(server, progressing) || changed
	changed = setDegradedCondition(server, &deployment) || changed

	if !changed {
		return nil
	}

	return r.Status().Update(ctx, server)
}

// markDegraded records a failed reconciliation on the status and in an event.
func (r *FactorioServerReconciler) markDegraded(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
	reconcileErr error,
) {
	message := "Reconciliation failed: " + reconcileErr.Error()

	changed := meta.SetStatusCondition(&server.Status.Conditions, metav1.Condition{
		Type:               ConditionDegraded,
		Status:             metav1.ConditionTrue,
		Reason:             "ReconcileFailed",
		Message:            message,
		ObservedGeneration: server.Generation,
	})
	changed = meta.SetStatusCondition(&server.Status.Conditions, metav1.Condition{
		Type:               ConditionAvailable,
		Status:             metav1.ConditionFalse,
		Reason:             "ReconcileFailed",
		Message:            message,
		ObservedGeneration: server.Generation,
	}) || changed

	r.recordEvent(server, corev1.EventTypeWarning, "ReconcileFailed", message)

	if !changed {
		return
	}

	if err := r.Status().Update(ctx, server); err != nil {
		logf.FromContext(ctx).Error(err, "Failed to update status", "name", server.Name)
	}
}

func setAvailableCondition(server *gamesv1alpha1.FactorioServer, available bool) bool {
	condition := metav1.Condition{
		Type:               ConditionAvailable,
		ObservedGeneration: server.Generation,
	}

	if available {
		condition.Status = metav1.ConditionTrue
		condition.Reason = "DeploymentAvailable"
		condition.Message = "The Factorio server is available."
	} else {
		condition.Status = metav1.ConditionFalse
		condition.Reason = "DeploymentUnavailable"
		condition.Message = "The Factorio server has no available replicas."
	}

	return meta.SetStatusCondition(&server.Status.Conditions, condition)
}

func setProgressingCondition(
	server *gamesv1alpha1.FactorioServer,
	progressing bool,
) bool {
	condition := metav1.Condition{
		Type:               ConditionProgressing,
		ObservedGeneration: server.Generation,
	}

	if progressing {
		condition.Status = metav1.ConditionTrue
		condition.Reason = "DeploymentProgressing"
		condition.Message = "The Factorio server rollout is in progress."
	} else {
		condition.Status = metav1.ConditionFalse
		condition.Reason = "DeploymentComplete"
		condition.Message = "The Factorio server rollout is complete."
	}

	return meta.SetStatusCondition(&server.Status.Conditions, condition)
}

func setDegradedCondition(
	server *gamesv1alpha1.FactorioServer,
	deployment *appsv1.Deployment,
) bool {
	condition := metav1.Condition{
		Type:               ConditionDegraded,
		ObservedGeneration: server.Generation,
	}

	var progressing *appsv1.DeploymentCondition
	for i := range deployment.Status.Conditions {
		if deployment.Status.Conditions[i].Type == appsv1.DeploymentProgressing {
			progressing = &deployment.Status.Conditions[i]
			break
		}
	}

	if progressing != nil && progressing.Reason == "ProgressDeadlineExceeded" {
		condition.Status = metav1.ConditionTrue
		condition.Reason = progressing.Reason
		condition.Message = progressing.Message
	} else {
		condition.Status = metav1.ConditionFalse
		condition.Reason = "DeploymentHealthy"
		condition.Message = "The Factorio server is healthy."
	}

	return meta.SetStatusCondition(&server.Status.Conditions, condition)
}

func setSuspendedCondition(
	server *gamesv1alpha1.FactorioServer,
	conditionType string,
) bool {
	return meta.SetStatusCondition(&server.Status.Conditions, metav1.Condition{
		Type:               conditionType,
		Status:             metav1.ConditionFalse,
		Reason:             "Suspended",
		Message:            "The server is stopped.",
		ObservedGeneration: server.Generation,
	})
}

func (r *FactorioServerReconciler) recordSuspensionEvent(
	server *gamesv1alpha1.FactorioServer,
	previousReplicas int32,
	desiredReplicas *int32,
) {
	if desiredReplicas == nil {
		return
	}

	switch {
	case previousReplicas > 0 && *desiredReplicas == 0:
		r.recordEvent(server, corev1.EventTypeNormal, "Suspended",
			fmt.Sprintf("Stopped FactorioServer %q", server.Name))
	case previousReplicas == 0 && *desiredReplicas > 0:
		r.recordEvent(server, corev1.EventTypeNormal, "Resumed",
			fmt.Sprintf("Started FactorioServer %q", server.Name))
	}
}

func (r *FactorioServerReconciler) recordEvent(
	server *gamesv1alpha1.FactorioServer,
	eventType, reason, message string,
) {
	if r.Recorder == nil {
		return
	}

	r.Recorder.Event(server, eventType, reason, message)
}
