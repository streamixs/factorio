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
	"k8s.io/apimachinery/pkg/api/equality"
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

	if err := r.reconcilePersistentVolumeClaim(ctx, server); err != nil {
		return fmt.Errorf("reconcile persistent volume claim: %w", err)
	}

	if err := r.reconcileSettingsObjects(ctx, server, files); err != nil {
		return fmt.Errorf("reconcile settings objects: %w", err)
	}

	if err := r.reconcileDeployment(ctx, server, files); err != nil {
		return fmt.Errorf("reconcile deployment: %w", err)
	}

	if err := r.reconcileService(ctx, server); err != nil {
		return fmt.Errorf("reconcile service: %w", err)
	}

	return nil
}

// renderSettings resolves the referenced secrets and renders the settings
// files that are present in the custom resource.
func (r *FactorioServerReconciler) renderSettings(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
) (factorioresources.ConfigFiles, error) {
	var files factorioresources.ConfigFiles

	if server.Spec.Server != nil {
		secrets, err := r.resolveSecrets(ctx, server)
		if err != nil {
			return files, err
		}

		content, err := config.RenderServerSettings(server.Spec.Server, secrets)
		if err != nil {
			return files, fmt.Errorf("render server settings: %w", err)
		}
		files.ServerSettings = content
	}

	if server.Spec.MapGenSettings != nil {
		content, err := config.RenderMapGenSettings(server.Spec.MapGenSettings)
		if err != nil {
			return files, fmt.Errorf("render map generation settings: %w", err)
		}
		files.MapGenSettings = content
	}

	if server.Spec.MapSettings != nil {
		content, err := config.RenderMapSettings(server.Spec.MapSettings)
		if err != nil {
			return files, fmt.Errorf("render map settings: %w", err)
		}
		files.MapSettings = content
	}

	return files, nil
}

// resolveSecrets reads the Secret keys referenced by the server settings.
func (r *FactorioServerReconciler) resolveSecrets(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
) (config.ServerSecretValues, error) {
	var values config.ServerSecretValues

	spec := server.Spec.Server
	if spec == nil {
		return values, nil
	}

	if spec.Access != nil && spec.Access.GamePasswordRef != nil {
		password, err := r.resolveSecretKey(ctx, server.Namespace,
			spec.Access.GamePasswordRef)
		if err != nil {
			return values, err
		}
		values.GamePassword = password
	}

	if spec.Authentication != nil {
		if ref := spec.Authentication.PasswordRef; ref != nil {
			password, err := r.resolveSecretKey(ctx, server.Namespace, ref)
			if err != nil {
				return values, err
			}
			values.Password = password
		}

		if ref := spec.Authentication.TokenRef; ref != nil {
			token, err := r.resolveSecretKey(ctx, server.Namespace, ref)
			if err != nil {
				return values, err
			}
			values.Token = token
		}
	}

	return values, nil
}

func (r *FactorioServerReconciler) resolveSecretKey(
	ctx context.Context,
	namespace string,
	ref *corev1.SecretKeySelector,
) (string, error) {
	if ref.Name == "" {
		return "", fmt.Errorf("secret reference has no name")
	}
	if ref.Key == "" {
		return "", fmt.Errorf("secret %q reference has no key", ref.Name)
	}

	var secret corev1.Secret
	if err := r.reader().Get(ctx, types.NamespacedName{
		Namespace: namespace,
		Name:      ref.Name,
	}, &secret); err != nil {
		return "", fmt.Errorf("get secret %q: %w", ref.Name, err)
	}

	value, ok := secret.Data[ref.Key]
	if !ok {
		return "", fmt.Errorf("secret %q has no key %q", ref.Name, ref.Key)
	}

	return string(value), nil
}

// reader returns the client used for reads that should bypass the cache.
func (r *FactorioServerReconciler) reader() client.Reader {
	if r.APIReader != nil {
		return r.APIReader
	}
	return r.Client
}

// reconcileSettingsObjects creates, updates or removes the Secret and
// ConfigMaps holding the rendered settings.
func (r *FactorioServerReconciler) reconcileSettingsObjects(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
	files factorioresources.ConfigFiles,
) error {
	if err := r.reconcileServerSettingsSecret(ctx, server,
		files.ServerSettings); err != nil {
		return err
	}

	if err := r.reconcileMapGenSettingsConfigMap(ctx, server,
		files.MapGenSettings); err != nil {
		return err
	}

	return r.reconcileMapSettingsConfigMap(ctx, server, files.MapSettings)
}

func (r *FactorioServerReconciler) reconcileServerSettingsSecret(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
	content []byte,
) error {
	name := factorioresources.ServerSettingsSecretName(server)

	if content == nil {
		return r.deleteIfOwned(ctx, server, &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: server.Namespace},
		})
	}

	desired := factorioresources.BuildServerSettingsSecret(server, content)
	if err := controllerutil.SetControllerReference(server, desired,
		r.Scheme); err != nil {
		return err
	}

	var existing corev1.Secret
	if err := r.reader().Get(ctx, client.ObjectKeyFromObject(desired),
		&existing); err != nil {
		if apierrors.IsNotFound(err) {
			if err := r.Create(ctx, desired); err != nil {
				return fmt.Errorf("create secret %q: %w", desired.Name, err)
			}
			r.recordEvent(server, corev1.EventTypeNormal, "Created",
				fmt.Sprintf("Created Secret %q", desired.Name))
			return nil
		}
		return fmt.Errorf("get secret %q: %w", desired.Name, err)
	}

	if !metav1.IsControlledBy(&existing, server) {
		return fmt.Errorf(
			"secret %q already exists and is not owned by FactorioServer %q",
			existing.Name, server.Name)
	}

	if equality.Semantic.DeepEqual(existing.Data, desired.Data) {
		return nil
	}

	existing.Data = desired.Data
	if err := r.Update(ctx, &existing); err != nil {
		return fmt.Errorf("update secret %q: %w", existing.Name, err)
	}

	r.recordEvent(server, corev1.EventTypeNormal, "Updated",
		fmt.Sprintf("Updated Secret %q", existing.Name))
	return nil
}

func (r *FactorioServerReconciler) reconcileMapGenSettingsConfigMap(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
	content []byte,
) error {
	name := factorioresources.MapGenSettingsConfigMapName(server)
	if content == nil {
		return r.deleteIfOwned(ctx, server, &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: server.Namespace},
		})
	}

	desired := factorioresources.BuildMapGenSettingsConfigMap(server, content)
	return r.reconcileConfigMap(ctx, server, desired)
}

func (r *FactorioServerReconciler) reconcileMapSettingsConfigMap(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
	content []byte,
) error {
	name := factorioresources.MapSettingsConfigMapName(server)
	if content == nil {
		return r.deleteIfOwned(ctx, server, &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: server.Namespace},
		})
	}

	desired := factorioresources.BuildMapSettingsConfigMap(server, content)
	return r.reconcileConfigMap(ctx, server, desired)
}

func (r *FactorioServerReconciler) reconcileConfigMap(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
	desired *corev1.ConfigMap,
) error {
	if err := controllerutil.SetControllerReference(server, desired,
		r.Scheme); err != nil {
		return err
	}

	var existing corev1.ConfigMap
	if err := r.reader().Get(ctx, client.ObjectKeyFromObject(desired),
		&existing); err != nil {
		if apierrors.IsNotFound(err) {
			if err := r.Create(ctx, desired); err != nil {
				return fmt.Errorf("create configmap %q: %w", desired.Name, err)
			}
			r.recordEvent(server, corev1.EventTypeNormal, "Created",
				fmt.Sprintf("Created ConfigMap %q", desired.Name))
			return nil
		}
		return fmt.Errorf("get configmap %q: %w", desired.Name, err)
	}

	if !metav1.IsControlledBy(&existing, server) {
		return fmt.Errorf(
			"configmap %q already exists and is not owned by FactorioServer %q",
			existing.Name, server.Name)
	}

	if equality.Semantic.DeepEqual(existing.Data, desired.Data) {
		return nil
	}

	existing.Data = desired.Data
	if err := r.Update(ctx, &existing); err != nil {
		return fmt.Errorf("update configmap %q: %w", existing.Name, err)
	}

	r.recordEvent(server, corev1.EventTypeNormal, "Updated",
		fmt.Sprintf("Updated ConfigMap %q", existing.Name))
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

	if err := r.Delete(ctx, obj); err != nil {
		return fmt.Errorf("delete %T %q: %w", obj, obj.GetName(), err)
	}

	kind := reflect.TypeOf(obj).Elem().Name()
	r.recordEvent(server, corev1.EventTypeNormal, "Deleted",
		fmt.Sprintf("Deleted %s %q", kind, obj.GetName()))
	return nil
}

func (r *FactorioServerReconciler) reconcileDeployment(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
	files factorioresources.ConfigFiles,
) error {
	logger := logf.FromContext(ctx)

	desired := factorioresources.BuildDeployment(server, files)
	key := types.NamespacedName{Namespace: desired.Namespace, Name: desired.Name}

	var existing appsv1.Deployment
	if err := r.Get(ctx, key, &existing); err != nil {
		if !apierrors.IsNotFound(err) {
			return fmt.Errorf("get deployment %q: %w", desired.Name, err)
		}

		if err := controllerutil.SetControllerReference(server, &desired,
			r.Scheme); err != nil {
			return err
		}

		if err := r.Create(ctx, &desired); err != nil {
			return fmt.Errorf("create deployment %q: %w", desired.Name, err)
		}

		logger.Info("Created Deployment", "name", desired.Name)
		r.recordEvent(server, corev1.EventTypeNormal, "Created",
			fmt.Sprintf("Created Deployment %q", desired.Name))
		return nil
	}

	if !metav1.IsControlledBy(&existing, server) {
		return fmt.Errorf(
			"deployment %q already exists and is not owned by FactorioServer %q",
			existing.Name, server.Name)
	}

	if !factorioresources.NeedsUpdate(&existing, &desired) {
		logger.Info("Deployment is up-to-date", "name", existing.Name)
		return nil
	}

	factorioresources.UpdateDeployment(&existing, &desired)

	if err := r.Update(ctx, &existing); err != nil {
		return fmt.Errorf("update deployment %q: %w", existing.Name, err)
	}

	logger.Info("Updated Deployment", "name", existing.Name)
	r.recordEvent(server, corev1.EventTypeNormal, "Updated",
		fmt.Sprintf("Updated Deployment %q", existing.Name))
	return nil
}

// reconcilePersistentVolumeClaim ensures the data claim exists. Resizing an
// existing claim is left to the cluster, since many StorageClasses cannot
// shrink a volume and expansion support varies.
func (r *FactorioServerReconciler) reconcilePersistentVolumeClaim(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
) error {
	desired, err := factorioresources.BuildPersistentVolumeClaim(server)
	if err != nil {
		return err
	}

	if err := controllerutil.SetControllerReference(server, desired,
		r.Scheme); err != nil {
		return err
	}

	var existing corev1.PersistentVolumeClaim
	if err := r.Get(ctx, client.ObjectKeyFromObject(desired),
		&existing); err != nil {
		if apierrors.IsNotFound(err) {
			if err := r.Create(ctx, desired); err != nil {
				return fmt.Errorf("create persistentvolumeclaim %q: %w",
					desired.Name, err)
			}
			r.recordEvent(server, corev1.EventTypeNormal, "Created",
				fmt.Sprintf("Created PersistentVolumeClaim %q", desired.Name))
			return nil
		}
		return fmt.Errorf("get persistentvolumeclaim %q: %w", desired.Name, err)
	}

	if !metav1.IsControlledBy(&existing, server) {
		return fmt.Errorf(
			"persistentvolumeclaim %q already exists and is not owned by "+
				"FactorioServer %q", existing.Name, server.Name)
	}

	return nil
}

// reconcileService ensures the Service exposing the game port exists and
// matches the custom resource.
func (r *FactorioServerReconciler) reconcileService(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
) error {
	desired := factorioresources.BuildService(server)

	if err := controllerutil.SetControllerReference(server, desired,
		r.Scheme); err != nil {
		return err
	}

	var existing corev1.Service
	if err := r.Get(ctx, client.ObjectKeyFromObject(desired),
		&existing); err != nil {
		if apierrors.IsNotFound(err) {
			if err := r.Create(ctx, desired); err != nil {
				return fmt.Errorf("create service %q: %w", desired.Name, err)
			}
			r.recordEvent(server, corev1.EventTypeNormal, "Created",
				fmt.Sprintf("Created Service %q", desired.Name))
			return nil
		}
		return fmt.Errorf("get service %q: %w", desired.Name, err)
	}

	if !metav1.IsControlledBy(&existing, server) {
		return fmt.Errorf(
			"service %q already exists and is not owned by FactorioServer %q",
			existing.Name, server.Name)
	}

	if !factorioresources.NeedsServiceUpdate(&existing, desired) {
		return nil
	}

	factorioresources.UpdateService(&existing, desired)

	if err := r.Update(ctx, &existing); err != nil {
		return fmt.Errorf("update service %q: %w", existing.Name, err)
	}

	r.recordEvent(server, corev1.EventTypeNormal, "Updated",
		fmt.Sprintf("Updated Service %q", existing.Name))
	return nil
}

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

func (r *FactorioServerReconciler) recordEvent(
	server *gamesv1alpha1.FactorioServer,
	eventType, reason, message string,
) {
	if r.Recorder == nil {
		return
	}

	r.Recorder.Event(server, eventType, reason, message)
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
