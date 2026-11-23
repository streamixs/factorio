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
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	"github.com/streamixs/factorio/apps/agent/internal/config"
	factorioresources "github.com/streamixs/factorio/apps/agent/internal/controller/resources"
)

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

// reconcileRconSecret ensures the RCON password Secret exists and returns the
// password the API uses to connect. The password is generated once and kept
// stable across reconciles; a missing or empty password is regenerated.
func (r *FactorioServerReconciler) reconcileRconSecret(
	ctx context.Context,
	server *gamesv1alpha1.FactorioServer,
) (string, error) {
	name := factorioresources.RconSecretName(server)

	var existing corev1.Secret
	err := r.reader().Get(ctx, types.NamespacedName{
		Namespace: server.Namespace,
		Name:      name,
	}, &existing)
	if err == nil {
		if !metav1.IsControlledBy(&existing, server) {
			return "", fmt.Errorf(
				"secret %q already exists and is not owned by FactorioServer %q",
				existing.Name, server.Name)
		}

		if password := existing.Data[factorioresources.RconPasswordKey]; len(password) > 0 {
			return string(password), nil
		}

		password, err := factorioresources.GenerateRconPassword()
		if err != nil {
			return "", fmt.Errorf("generate rcon password: %w", err)
		}
		if existing.Data == nil {
			existing.Data = map[string][]byte{}
		}
		existing.Data[factorioresources.RconPasswordKey] = []byte(password)
		if err := r.Update(ctx, &existing); err != nil {
			return "", fmt.Errorf("update secret %q: %w", existing.Name, err)
		}
		r.recordEvent(server, corev1.EventTypeNormal, "Updated",
			fmt.Sprintf("Updated Secret %q", existing.Name))
		return password, nil
	}
	if !apierrors.IsNotFound(err) {
		return "", fmt.Errorf("get secret %q: %w", name, err)
	}

	password, err := factorioresources.GenerateRconPassword()
	if err != nil {
		return "", fmt.Errorf("generate rcon password: %w", err)
	}

	desired := factorioresources.BuildRconSecret(server, password)
	if err := controllerutil.SetControllerReference(server, desired,
		r.Scheme); err != nil {
		return "", err
	}

	if err := r.Create(ctx, desired); err != nil {
		return "", fmt.Errorf("create secret %q: %w", desired.Name, err)
	}
	r.recordEvent(server, corev1.EventTypeNormal, "Created",
		fmt.Sprintf("Created Secret %q", desired.Name))
	return password, nil
}
