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
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	factorioresources "github.com/streamixs/factorio/apps/agent/internal/controller/resources"
)

func (r *FactorioServerReconciler) reconcileDeployment(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
	files factorioresources.ConfigFiles,
	rconPassword string,
	resources corev1.ResourceRequirements,
) error {
	logger := logf.FromContext(ctx)

	desired := factorioresources.BuildDeployment(server, files, rconPassword,
		resources)
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

	previousReplicas := int32(1)
	if existing.Spec.Replicas != nil {
		previousReplicas = *existing.Spec.Replicas
	}

	factorioresources.UpdateDeployment(&existing, &desired)

	if err := r.Update(ctx, &existing); err != nil {
		return fmt.Errorf("update deployment %q: %w", existing.Name, err)
	}

	logger.Info("Updated Deployment", "name", existing.Name)
	r.recordEvent(server, corev1.EventTypeNormal, "Updated",
		fmt.Sprintf("Updated Deployment %q", existing.Name))
	r.recordSuspensionEvent(server, previousReplicas, desired.Spec.Replicas)
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
		if server.Annotations[factorioresources.KeepPVCPendingAnnotation] == annotationTrue {
			return nil
		}

		if existing.Annotations[factorioresources.KeepPVCAnnotation] == annotationTrue {
			if err := controllerutil.SetControllerReference(server, &existing,
				r.Scheme); err != nil {
				return fmt.Errorf("adopt persistentvolumeclaim %q: %w",
					existing.Name, err)
			}
			delete(existing.Annotations, factorioresources.KeepPVCAnnotation)
			if err := r.Update(ctx, &existing); err != nil {
				return fmt.Errorf("update adopted persistentvolumeclaim %q: %w",
					existing.Name, err)
			}
			r.recordEvent(server, corev1.EventTypeNormal, "Adopted",
				fmt.Sprintf("Adopted PersistentVolumeClaim %q", existing.Name))
			return nil
		}

		return fmt.Errorf(
			"persistentvolumeclaim %q already exists and is not owned by "+
				"FactorioServer %q", existing.Name, server.Name)
	}

	return nil
}

// deleteLegacyBackupPersistentVolumeClaim removes the claim created by the
// removed copy-based backup feature. Factorio writes its autosaves in the data
// volume, so the separate claim would only leak unused copies.
func (r *FactorioServerReconciler) deleteLegacyBackupPersistentVolumeClaim(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
) error {
	return r.deleteIfOwned(ctx, server, &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      factorioresources.LegacyBackupPersistentVolumeClaimName(server.Name),
			Namespace: server.Namespace,
		},
	})
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
