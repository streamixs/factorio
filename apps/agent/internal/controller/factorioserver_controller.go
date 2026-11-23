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
	"reflect"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	"github.com/streamixs/factorio/apps/agent/internal/config"
	factorioresources "github.com/streamixs/factorio/apps/agent/internal/controller/resources"
)

// FactorioServerReconciler reconciles a FactorioServer object
type FactorioServerReconciler struct {
	client.Client

	// APIReader reads Secrets directly from the API server instead of through
	// the cache, so the controller does not watch every Secret in the cluster.
	// It falls back to Client when unset, which keeps tests simple.
	APIReader client.Reader

	// Recorder publishes Kubernetes events for the resources the controller
	// creates, updates and deletes.
	Recorder record.EventRecorder

	Scheme *runtime.Scheme
}

const (
	// ConditionAvailable is true when the server has an available replica.
	ConditionAvailable = "Available"

	// ConditionProgressing is true while the server rollout is in progress.
	ConditionProgressing = "Progressing"

	// ConditionDegraded is true when reconciliation failed or the rollout
	// exceeded its deadline.
	ConditionDegraded = "Degraded"
)

// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups="",resources=persistentvolumeclaims,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=games.dev.streamixs.com,resources=factorioservers,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=games.dev.streamixs.com,resources=factorioservers/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=games.dev.streamixs.com,resources=factorioservers/finalizers,verbs=update

// Reconcile moves the cluster state towards the desired FactorioServer state.
func (r *FactorioServerReconciler) Reconcile(
	ctx context.Context,
	req ctrl.Request,
) (ctrl.Result, error) {
	logger := logf.FromContext(ctx)

	var factorioServer gamesv1alpha1.FactorioServer
	if err := r.Get(ctx, req.NamespacedName, &factorioServer); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	logger.Info("Reconciling FactorioServer", "name", factorioServer.Name,
		"namespace", factorioServer.Namespace)

	if err := r.reconcileResources(ctx, &factorioServer); err != nil {
		logger.Error(err, "Failed to reconcile resources", "name", factorioServer.Name)
		r.markDegraded(ctx, &factorioServer, err)
		return ctrl.Result{}, err
	}

	if err := r.updateStatus(ctx, &factorioServer); err != nil {
		logger.Error(err, "Failed to update status", "name", factorioServer.Name)
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}

// reconcileResources converges the owned resources towards the desired state.
func (r *FactorioServerReconciler) reconcileResources(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
) error {
	files, err := r.renderSettings(ctx, server)
	if err != nil {
		return err
	}

	effective, err := config.RenderEffectiveSettings(&server.Spec)
	if err != nil {
		return fmt.Errorf("render effective settings: %w", err)
	}

	if err := r.reconcilePersistentVolumeClaim(ctx, server); err != nil {
		return fmt.Errorf("reconcile persistent volume claim: %w", err)
	}

	if err := r.deleteLegacyBackupPersistentVolumeClaim(ctx, server); err != nil {
		return fmt.Errorf("remove legacy backup persistent volume claim: %w", err)
	}

	if err := r.reconcileSettingsObjects(ctx, server, files); err != nil {
		return fmt.Errorf("reconcile settings objects: %w", err)
	}

	if err := r.reconcileEffectiveSettingsConfigMap(ctx, server, effective); err != nil {
		return fmt.Errorf("reconcile effective settings: %w", err)
	}

	rconPassword, err := r.reconcileRconSecret(ctx, server)
	if err != nil {
		return fmt.Errorf("reconcile rcon secret: %w", err)
	}

	resources, err := factorioresources.BuildResources(server)
	if err != nil {
		return fmt.Errorf("resolve server resources: %w", err)
	}

	if err := r.reconcileDeployment(ctx, server, files, rconPassword,
		resources); err != nil {
		return fmt.Errorf("reconcile deployment: %w", err)
	}

	if err := r.reconcileService(ctx, server); err != nil {
		return fmt.Errorf("reconcile service: %w", err)
	}

	return nil
}

// deleteIfOwned deletes obj when it exists and is controlled by server.
func (r *FactorioServerReconciler) deleteIfOwned(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
	obj client.Object,
) error {
	if err := r.reader().Get(ctx, client.ObjectKeyFromObject(obj), obj); err != nil {
		return client.IgnoreNotFound(err)
	}

	if !metav1.IsControlledBy(obj, server) {
		return nil
	}

	if !obj.GetDeletionTimestamp().IsZero() {
		return nil
	}

	if err := r.Delete(ctx, obj); err != nil {
		return fmt.Errorf("delete %T %q: %w", obj, obj.GetName(), err)
	}

	kind := reflect.TypeOf(obj).Elem().Name()
	r.recordEvent(server, corev1.EventTypeNormal, "Deleted",
		fmt.Sprintf("Deleted %s %q", kind, obj.GetName()))
	return nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *FactorioServerReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&gamesv1alpha1.FactorioServer{}).
		Owns(&appsv1.Deployment{}).
		Owns(&corev1.ConfigMap{}).
		Owns(&corev1.PersistentVolumeClaim{}).
		Owns(&corev1.Service{}).
		Named("factorioserver").
		Complete(r)
}
