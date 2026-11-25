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
	"time"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	factorioresources "github.com/streamixs/factorio/apps/agent/internal/controller/resources"
)

const (
	operationFinalizer = "games.dev.streamixs.com/operation-cleanup"
	operationTimeout   = 20 * time.Minute
	operationPoll      = 2 * time.Second
	// Terminal operations are kept for debugging, then garbage collected.
	operationRetention = 7 * 24 * time.Hour
	// operationResumedAnnotation prevents a terminal operation from resuming the
	// server again if the user stopped it after the operation finished.
	operationResumedAnnotation = "games.dev.streamixs.com/operation-resumed"
	// operationExpiredAnnotation lets the finalizer skip resume logic for
	// operations deleted by the retention policy.
	operationExpiredAnnotation = "games.dev.streamixs.com/operation-expired"
	annotationTrue             = "true"
)

// FactorioOperationReconciler runs restore and import operations on the data
// volume. It owns the suspend/Job/resume state machine, so an API restart does
// not leave a server stopped or an operation half-done.
type FactorioOperationReconciler struct {
	client.Client
	Recorder record.EventRecorder
	Scheme   *runtime.Scheme
}

// +kubebuilder:rbac:groups=games.dev.streamixs.com,resources=factoriooperations,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=games.dev.streamixs.com,resources=factoriooperations/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=games.dev.streamixs.com,resources=factoriooperations/finalizers,verbs=update
// +kubebuilder:rbac:groups=batch,resources=jobs,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=pods,verbs=get;list;watch

// Reconcile drives one FactorioOperation to a terminal phase.
func (r *FactorioOperationReconciler) Reconcile(
	ctx context.Context,
	req ctrl.Request,
) (ctrl.Result, error) {
	logger := logf.FromContext(ctx)

	var operation gamesv1alpha1.FactorioOperation
	if err := r.Get(ctx, req.NamespacedName, &operation); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	if !operation.DeletionTimestamp.IsZero() {
		return r.finalize(ctx, &operation)
	}

	if !controllerutil.ContainsFinalizer(&operation, operationFinalizer) {
		controllerutil.AddFinalizer(&operation, operationFinalizer)
		if err := r.Update(ctx, &operation); err != nil {
			return ctrl.Result{}, err
		}
	}

	var server gamesv1alpha1.FactorioServer
	if err := r.Get(ctx, types.NamespacedName{
		Namespace: operation.Namespace,
		Name:      operation.Spec.ServerName,
	}, &server); err != nil {
		if apierrors.IsNotFound(err) {
			return r.fail(ctx, &operation,
				fmt.Sprintf("FactorioServer %q was not found", operation.Spec.ServerName))
		}
		return ctrl.Result{}, err
	}

	if !metav1.IsControlledBy(&operation, &server) {
		if err := controllerutil.SetControllerReference(&server, &operation,
			r.Scheme); err != nil {
			return ctrl.Result{}, err
		}
		if err := r.Update(ctx, &operation); err != nil {
			return ctrl.Result{}, err
		}
	}

	if operation.Status.Phase == "" ||
		operation.Status.Phase == gamesv1alpha1.OperationPhasePending {
		conflict, err := r.conflictingOperation(ctx, &operation)
		if err != nil {
			return ctrl.Result{}, err
		}
		if conflict != nil {
			return r.failConflict(ctx, &operation, &server,
				fmt.Sprintf("Operation %q is already in progress", conflict.Name))
		}
	}

	logger.Info("Reconciling FactorioOperation",
		"name", operation.Name, "server", server.Name,
		"phase", operation.Status.Phase)

	switch operation.Status.Phase {
	case "", gamesv1alpha1.OperationPhasePending:
		return r.begin(ctx, &operation, &server)
	case gamesv1alpha1.OperationPhaseSuspending:
		return r.suspendAndRun(ctx, &operation, &server)
	case gamesv1alpha1.OperationPhaseRunning:
		return r.observeJob(ctx, &operation, &server)
	case gamesv1alpha1.OperationPhaseCompleted, gamesv1alpha1.OperationPhaseFailed:
		pending, err := r.ensureJobDeleted(ctx, &operation)
		if err != nil {
			return ctrl.Result{}, err
		}
		if pending {
			return ctrl.Result{RequeueAfter: operationPoll}, nil
		}

		// A failed operation may have suspended the server. Resume it only
		// after the Job and its pods are gone, and only if the operation
		// actually started and the user had not stopped the server first.
		if operation.Status.Phase == gamesv1alpha1.OperationPhaseFailed &&
			operation.Status.StartedAt != nil {
			if err := r.resumeIfNeeded(ctx, &operation, &server, true); err != nil {
				return ctrl.Result{}, err
			}
		}
		return r.scheduleRetention(ctx, &operation)
	default:
		return r.fail(ctx, &operation,
			fmt.Sprintf("Unknown operation phase %q", operation.Status.Phase))
	}
}

// conflictingOperation returns another non-terminal operation for the same
// server. Pending operations use their name as a deterministic tie-break so
// only one of them can start.
func (r *FactorioOperationReconciler) conflictingOperation(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
) (*gamesv1alpha1.FactorioOperation, error) {
	var operations gamesv1alpha1.FactorioOperationList
	if err := r.List(ctx, &operations,
		client.InNamespace(operation.Namespace)); err != nil {
		return nil, err
	}

	for i := range operations.Items {
		other := &operations.Items[i]
		if other.Name == operation.Name ||
			other.Spec.ServerName != operation.Spec.ServerName {
			continue
		}

		switch other.Status.Phase {
		case gamesv1alpha1.OperationPhaseSuspending,
			gamesv1alpha1.OperationPhaseRunning:
			return other, nil
		case "", gamesv1alpha1.OperationPhasePending:
			if other.Name < operation.Name {
				return other, nil
			}
		}
	}

	return nil, nil
}

// failConflict rejects an operation that would run at the same time as another
// one. It records the server state so finalization never restarts a server the
// user had stopped.
func (r *FactorioOperationReconciler) failConflict(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
	server *gamesv1alpha1.FactorioServer,
	message string,
) (ctrl.Result, error) {
	operation.Status.WasSuspended = server.Spec.Suspended
	r.finish(operation, gamesv1alpha1.OperationPhaseFailed, message)
	if err := r.Status().Update(ctx, operation); err != nil {
		return ctrl.Result{}, err
	}

	r.deleteJob(ctx, operation)
	r.recordEvent(operation, corev1.EventTypeWarning, "Conflict", message)
	return r.scheduleRetention(ctx, operation)
}

// begin records whether the server was already stopped before suspending it.
// Persisting that decision first makes the suspend step idempotent: a crash
// after scaling the server down cannot make it look like the user had stopped
// it.
func (r *FactorioOperationReconciler) begin(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
	server *gamesv1alpha1.FactorioServer,
) (ctrl.Result, error) {
	now := metav1.Now()
	operation.Status.StartedAt = &now
	operation.Status.WasSuspended = server.Spec.Suspended
	operation.Status.Phase = gamesv1alpha1.OperationPhaseSuspending
	operation.Status.Message = "Preparing the operation"

	r.recordEvent(operation, corev1.EventTypeNormal, "Started",
		fmt.Sprintf("Starting %s operation for %q",
			operation.Spec.Type, server.Name))

	if err := r.Status().Update(ctx, operation); err != nil {
		return ctrl.Result{}, err
	}

	return ctrl.Result{RequeueAfter: operationPoll}, nil
}

// suspendAndRun stops the server when it was running, waits for its pod to
// release the data volume, then creates the operation Job.
func (r *FactorioOperationReconciler) suspendAndRun(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
	server *gamesv1alpha1.FactorioServer,
) (ctrl.Result, error) {
	if !operation.Status.WasSuspended && !server.Spec.Suspended {
		server.Spec.Suspended = true
		if err := r.Update(ctx, server); err != nil {
			return ctrl.Result{}, err
		}
		r.recordEvent(operation, corev1.EventTypeNormal, "Suspending",
			fmt.Sprintf("Stopping FactorioServer %q", server.Name))
	}

	var pods corev1.PodList
	if err := r.List(ctx, &pods,
		client.InNamespace(server.Namespace),
		client.MatchingLabels{"app.kubernetes.io/instance": server.Name},
	); err != nil {
		return ctrl.Result{}, err
	}
	if len(pods.Items) > 0 {
		operation.Status.Message = "Waiting for the server pod to stop"
		if err := r.Status().Update(ctx, operation); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{RequeueAfter: operationPoll}, nil
	}

	desired := factorioresources.BuildOperationJob(operation, server)
	if err := controllerutil.SetControllerReference(operation, desired,
		r.Scheme); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.Create(ctx, desired); err != nil && !apierrors.IsAlreadyExists(err) {
		return ctrl.Result{}, fmt.Errorf("create operation job %q: %w",
			desired.Name, err)
	}

	operation.Status.Phase = gamesv1alpha1.OperationPhaseRunning
	operation.Status.JobName = desired.Name
	operation.Status.Message = "Installing the save"
	if err := r.Status().Update(ctx, operation); err != nil {
		return ctrl.Result{}, err
	}

	r.recordEvent(operation, corev1.EventTypeNormal, "Running",
		fmt.Sprintf("Started Job %q", desired.Name))
	return ctrl.Result{RequeueAfter: operationPoll}, nil
}

// observeJob waits for the Job to finish, then resumes the server when the
// operation is the one that stopped it.
func (r *FactorioOperationReconciler) observeJob(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
	server *gamesv1alpha1.FactorioServer,
) (ctrl.Result, error) {
	job := &batchv1.Job{}
	key := types.NamespacedName{
		Namespace: operation.Namespace,
		Name:      operation.Status.JobName,
	}

	if err := r.Get(ctx, key, job); err != nil {
		if !apierrors.IsNotFound(err) {
			return ctrl.Result{}, err
		}

		// The Job may have been removed after completion. Recreating it is
		// safe for both operations: the scripts overwrite the same target
		// save.
		desired := factorioresources.BuildOperationJob(operation, server)
		if err := controllerutil.SetControllerReference(operation, desired,
			r.Scheme); err != nil {
			return ctrl.Result{}, err
		}
		if err := r.Create(ctx, desired); err != nil && !apierrors.IsAlreadyExists(err) {
			return ctrl.Result{}, fmt.Errorf("recreate operation job %q: %w",
				desired.Name, err)
		}
		return ctrl.Result{RequeueAfter: operationPoll}, nil
	}

	if job.Status.Succeeded > 0 {
		return r.complete(ctx, operation, server, "Save installed")
	}

	if jobFailed(job) {
		return r.fail(ctx, operation, "The operation Job failed")
	}

	if operation.Status.StartedAt != nil &&
		time.Since(operation.Status.StartedAt.Time) > operationTimeout {
		return r.fail(ctx, operation, "The operation timed out")
	}

	return ctrl.Result{RequeueAfter: operationPoll}, nil
}

func (r *FactorioOperationReconciler) complete(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
	server *gamesv1alpha1.FactorioServer,
	message string,
) (ctrl.Result, error) {
	if err := r.resumeIfNeeded(ctx, operation, server, false); err != nil {
		return ctrl.Result{}, err
	}

	r.finish(operation, gamesv1alpha1.OperationPhaseCompleted, message)
	if err := r.Status().Update(ctx, operation); err != nil {
		return ctrl.Result{}, err
	}

	// Delete only after the terminal phase is persisted. If the status write
	// fails, the Job stays and the next reconcile retries without running the
	// operation a second time.
	r.deleteJob(ctx, operation)
	r.recordEvent(operation, corev1.EventTypeNormal, "Completed", message)
	return r.scheduleRetention(ctx, operation)
}

// fail stops the operation. The server is resumed later, once the Job and its
// pods are gone, by the terminal phase handler.
func (r *FactorioOperationReconciler) fail(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
	message string,
) (ctrl.Result, error) {
	r.finish(operation, gamesv1alpha1.OperationPhaseFailed, message)
	if err := r.Status().Update(ctx, operation); err != nil {
		return ctrl.Result{}, err
	}

	r.deleteJob(ctx, operation)
	r.recordEvent(operation, corev1.EventTypeWarning, "Failed", message)
	return ctrl.Result{RequeueAfter: operationPoll}, nil
}

func (r *FactorioOperationReconciler) resumeIfNeeded(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
	server *gamesv1alpha1.FactorioServer,
	markResumed bool,
) error {
	if operation.Annotations[operationResumedAnnotation] == annotationTrue {
		return nil
	}

	if operation.Status.WasSuspended || !server.Spec.Suspended {
		if markResumed {
			return r.markResumed(ctx, operation)
		}
		return nil
	}

	server.Spec.Suspended = false
	if err := r.Update(ctx, server); err != nil {
		return fmt.Errorf("resume FactorioServer %q: %w", server.Name, err)
	}

	r.recordEvent(operation, corev1.EventTypeNormal, "Resumed",
		fmt.Sprintf("Restarted FactorioServer %q", server.Name))

	if markResumed {
		return r.markResumed(ctx, operation)
	}
	return nil
}

// markResumed records that the server side of the operation was handled, so a
// later retention reconcile cannot restart a server the user stopped manually.
func (r *FactorioOperationReconciler) markResumed(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
) error {
	if operation.Annotations[operationResumedAnnotation] == annotationTrue {
		return nil
	}
	if operation.Annotations == nil {
		operation.Annotations = map[string]string{}
	}
	operation.Annotations[operationResumedAnnotation] = annotationTrue
	if err := r.Update(ctx, operation); err != nil {
		return fmt.Errorf("mark FactorioOperation %q as resumed: %w",
			operation.Name, err)
	}
	return nil
}

// scheduleRetention keeps terminal operations for a fixed period, then deletes
// them. The expired annotation tells the finalizer not to run the resume logic.
func (r *FactorioOperationReconciler) scheduleRetention(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
) (ctrl.Result, error) {
	completedAt := operation.CreationTimestamp.Time
	if operation.Status.CompletedAt != nil {
		completedAt = operation.Status.CompletedAt.Time
	}
	if completedAt.IsZero() {
		return ctrl.Result{}, nil
	}

	expiresAt := completedAt.Add(operationRetention)
	if now := time.Now(); now.Before(expiresAt) {
		return ctrl.Result{RequeueAfter: expiresAt.Sub(now)}, nil
	}

	if operation.Annotations[operationExpiredAnnotation] != annotationTrue {
		if operation.Annotations == nil {
			operation.Annotations = map[string]string{}
		}
		operation.Annotations[operationExpiredAnnotation] = annotationTrue
		if err := r.Update(ctx, operation); err != nil {
			return ctrl.Result{}, fmt.Errorf(
				"mark FactorioOperation %q expired: %w", operation.Name, err)
		}
	}

	if err := r.Delete(ctx, operation); err != nil &&
		!apierrors.IsNotFound(err) {
		return ctrl.Result{}, fmt.Errorf(
			"delete expired FactorioOperation %q: %w", operation.Name, err)
	}
	return ctrl.Result{}, nil
}

func (r *FactorioOperationReconciler) finish(
	operation *gamesv1alpha1.FactorioOperation,
	phase string,
	message string,
) {
	now := metav1.Now()
	operation.Status.Phase = phase
	operation.Status.Message = message
	operation.Status.CompletedAt = &now

	condition := metav1.Condition{
		Type:               "Completed",
		Status:             metav1.ConditionFalse,
		Reason:             phase,
		Message:            message,
		ObservedGeneration: operation.Generation,
	}
	if phase == gamesv1alpha1.OperationPhaseCompleted {
		condition.Status = metav1.ConditionTrue
	}
	meta.SetStatusCondition(&operation.Status.Conditions, condition)
}

func (r *FactorioOperationReconciler) deleteJob(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
) {
	if operation.Status.JobName == "" {
		return
	}

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      operation.Status.JobName,
			Namespace: operation.Namespace,
		},
	}
	if err := r.Delete(ctx, job, client.PropagationPolicy(
		metav1.DeletePropagationForeground)); err != nil &&
		!apierrors.IsNotFound(err) {
		logf.FromContext(ctx).Error(err, "Failed to delete operation Job",
			"name", operation.Status.JobName)
	}
}

// ensureJobDeleted requests deletion of the operation Job and reports whether
// it is still present. Finalization waits for it so a Factorio pod never mounts
// the data volume while the Job is still writing.
func (r *FactorioOperationReconciler) ensureJobDeleted(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
) (bool, error) {
	if operation.Status.JobName == "" {
		return false, nil
	}

	job := &batchv1.Job{}
	err := r.Get(ctx, types.NamespacedName{
		Namespace: operation.Namespace,
		Name:      operation.Status.JobName,
	}, job)
	if apierrors.IsNotFound(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	if job.DeletionTimestamp.IsZero() {
		if err := r.Delete(ctx, job, client.PropagationPolicy(
			metav1.DeletePropagationForeground)); err != nil &&
			!apierrors.IsNotFound(err) {
			return false, fmt.Errorf("delete operation Job %q: %w",
				job.Name, err)
		}
	}

	return true, nil
}

// finalize waits for the Job to disappear before releasing the server, then
// lets the operation be deleted.
func (r *FactorioOperationReconciler) finalize(
	ctx context.Context,
	operation *gamesv1alpha1.FactorioOperation,
) (ctrl.Result, error) {
	pending, err := r.ensureJobDeleted(ctx, operation)
	if err != nil {
		return ctrl.Result{}, err
	}
	if pending {
		return ctrl.Result{RequeueAfter: operationPoll}, nil
	}

	var server gamesv1alpha1.FactorioServer
	err = r.Get(ctx, types.NamespacedName{
		Namespace: operation.Namespace,
		Name:      operation.Spec.ServerName,
	}, &server)
	if err == nil {
		if operation.Annotations[operationExpiredAnnotation] != annotationTrue &&
			operation.Status.StartedAt != nil &&
			!operation.Status.WasSuspended && operation.Status.Phase !=
			gamesv1alpha1.OperationPhaseCompleted {
			if err := r.resumeIfNeeded(ctx, operation, &server, false); err != nil {
				return ctrl.Result{}, err
			}
		}
	} else if !apierrors.IsNotFound(err) {
		return ctrl.Result{}, err
	}

	controllerutil.RemoveFinalizer(operation, operationFinalizer)
	if err := r.Update(ctx, operation); err != nil {
		return ctrl.Result{}, err
	}
	return ctrl.Result{}, nil
}

func jobFailed(job *batchv1.Job) bool {
	for _, condition := range job.Status.Conditions {
		if condition.Type == batchv1.JobFailed &&
			condition.Status == corev1.ConditionTrue {
			return true
		}
	}
	return false
}

func (r *FactorioOperationReconciler) recordEvent(
	operation *gamesv1alpha1.FactorioOperation,
	eventType, reason, message string,
) {
	if r.Recorder == nil {
		return
	}
	r.Recorder.Event(operation, eventType, reason, message)
}

// SetupWithManager sets up the operation controller with the Manager.
func (r *FactorioOperationReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&gamesv1alpha1.FactorioOperation{}).
		Owns(&batchv1.Job{}).
		Named("factoriooperation").
		Complete(r)
}
