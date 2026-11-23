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

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/equality"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	"github.com/streamixs/factorio/apps/agent/internal/config"
	factorioresources "github.com/streamixs/factorio/apps/agent/internal/controller/resources"
)

// renderSettings resolves the referenced secrets and renders the settings
// files that are present in the custom resource.
func (r *FactorioServerReconciler) renderSettings(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
) (factorioresources.ConfigFiles, error) {
	var files factorioresources.ConfigFiles

	secrets, err := r.resolveSecrets(ctx, server)
	if err != nil {
		return files, err
	}

	serverSettings, err := config.RenderServerSettings(server.Spec.Server, secrets)
	if err != nil {
		return files, fmt.Errorf("render server settings: %w", err)
	}
	files.ServerSettings = serverSettings

	mapGenSettings, err := config.RenderMapGenSettings(server.Spec.MapGenSettings)
	if err != nil {
		return files, fmt.Errorf("render map generation settings: %w", err)
	}
	files.MapGenSettings = mapGenSettings

	mapSettings, err := config.RenderMapSettings(server.Spec.MapSettings)
	if err != nil {
		return files, fmt.Errorf("render map settings: %w", err)
	}
	files.MapSettings = mapSettings

	return files, nil
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

// reconcileEffectiveSettingsConfigMap publishes the default and effective
// specifications for the API and the UI. It is not mounted in the pod.
func (r *FactorioServerReconciler) reconcileEffectiveSettingsConfigMap(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
	settings *config.EffectiveSettings,
) error {
	desired := factorioresources.BuildEffectiveSettingsConfigMap(
		server, settings.Defaults, settings.Effective,
	)
	return r.reconcileConfigMap(ctx, server, desired)
}
