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

	appsv1 "k8s.io/api/apps/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	factorioresources "github.com/streamixs/factorio/apps/agent/internal/controller/resources"
)

// FactorioServerReconciler reconciles a FactorioServer object
type FactorioServerReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=games.dev.streamixs.com,resources=factorioservers,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=games.dev.streamixs.com,resources=factorioservers/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=games.dev.streamixs.com,resources=factorioservers/finalizers,verbs=update

// Reconcile is part of the main kubernetes reconciliation loop which aims to
// move the current state of the cluster closer to the desired state.
// TODO(user): Modify the Reconcile function to compare the state specified by
// the FactorioServer object against the actual cluster state, and then
// perform operations to make the cluster state reflect the state specified by
// the user.
//
// For more details, check Reconcile and its Result here:
// - https://pkg.go.dev/sigs.k8s.io/controller-runtime@v0.25.0/pkg/reconcile
func (r *FactorioServerReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := logf.FromContext(ctx)

	var factorioServer gamesv1alpha1.FactorioServer
	if err := r.Get(ctx, req.NamespacedName, &factorioServer); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	logger.Info("Reconciling FactorioServer", "name", factorioServer.Name, "namespace", factorioServer.Namespace)
	deployment := factorioresources.BuildDeployment(&factorioServer)

	var existingDeployment appsv1.Deployment

	if err := r.Get(ctx, types.NamespacedName{
		Namespace: deployment.Namespace,
		Name:      deployment.Name,
	}, &existingDeployment); err != nil {
		if apierrors.IsNotFound(err) {
			// Deployment absent : le créer

			if err := controllerutil.SetControllerReference(
				&factorioServer,
				&deployment,
				r.Scheme,
			); err != nil {
				return ctrl.Result{}, err
			}

			if err := r.Create(ctx, &deployment); err != nil {
				logger.Error(err, "Failed to create Deployment", "name", deployment.Name)
				return ctrl.Result{}, err
			}

			logger.Info("Created Deployment", "name", deployment.Name)
		} else {
			// Autre erreur : la retourner
			logger.Error(err, "Failed to get Deployment", "name", deployment.Name)
			return ctrl.Result{}, err
		}
	} else {

		// check if the existing deployment is owned by the FactorioServer resource
		if !metav1.IsControlledBy(&existingDeployment, &factorioServer) {
			logger.Error(nil, "Deployment is not owned by FactorioServer", "name", existingDeployment.Name)
			return ctrl.Result{}, nil
		}

		if !factorioresources.NeedsUpdate(&existingDeployment, &deployment) {
			logger.Info("Deployment is up-to-date", "name", existingDeployment.Name)
			return ctrl.Result{}, nil
		}

		factorioresources.UpdateDeployment(&existingDeployment, &deployment)

		if err := r.Update(ctx, &existingDeployment); err != nil {
			logger.Error(err, "Failed to update Deployment", "name", existingDeployment.Name)
			return ctrl.Result{}, err
		}

		logger.Info("Updated Deployment", "name", existingDeployment.Name)
	}

	return ctrl.Result{}, nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *FactorioServerReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&gamesv1alpha1.FactorioServer{}).
		Named("factorioserver").
		Complete(r)
}
