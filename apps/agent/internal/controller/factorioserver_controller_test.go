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
	"encoding/json"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/record"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	factorioresources "github.com/streamixs/factorio/apps/agent/internal/controller/resources"
)

const testServerVersion = "2.1.24"

func drainEvents(recorder *record.FakeRecorder) []string {
	var events []string
	for {
		select {
		case event := <-recorder.Events:
			events = append(events, event)
		default:
			return events
		}
	}
}

var _ = Describe("FactorioServer Controller", func() {
	const (
		resourceName      = "test-resource"
		resourceNamespace = "default"
		credentialsName   = "factorio-credentials"
	)

	ctx := context.Background()

	key := types.NamespacedName{
		Name:      resourceName,
		Namespace: resourceNamespace,
	}

	serverSettingsKey := types.NamespacedName{
		Name:      resourceName + "-server-settings",
		Namespace: resourceNamespace,
	}

	mapGenSettingsKey := types.NamespacedName{
		Name:      resourceName + "-map-gen-settings",
		Namespace: resourceNamespace,
	}

	mapSettingsKey := types.NamespacedName{
		Name:      resourceName + "-map-settings",
		Namespace: resourceNamespace,
	}

	effectiveSettingsKey := types.NamespacedName{
		Name:      resourceName + "-effective-settings",
		Namespace: resourceNamespace,
	}

	claimKey := types.NamespacedName{
		Name:      resourceName + "-data",
		Namespace: resourceNamespace,
	}

	rconSecretKey := types.NamespacedName{
		Name:      resourceName + "-rcon",
		Namespace: resourceNamespace,
	}

	var reconciler *FactorioServerReconciler
	var recorder *record.FakeRecorder

	BeforeEach(func() {
		recorder = record.NewFakeRecorder(100)
		reconciler = &FactorioServerReconciler{
			Client:    k8sClient,
			APIReader: k8sClient,
			Recorder:  recorder,
			Scheme:    k8sClient.Scheme(),
		}

		By("creating the referenced credentials Secret")
		credentials := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      credentialsName,
				Namespace: resourceNamespace,
			},
			Data: map[string][]byte{
				"game-password": []byte("hunter2"),
				"token":         []byte("api-token"),
			},
		}
		err := k8sClient.Create(ctx, credentials)
		if err != nil && !apierrors.IsAlreadyExists(err) {
			Expect(err).NotTo(HaveOccurred())
		}

		By("creating the custom resource for the Kind FactorioServer")
		resource := &gamesv1alpha1.FactorioServer{
			ObjectMeta: metav1.ObjectMeta{
				Name:      resourceName,
				Namespace: resourceNamespace,
			},
			Spec: gamesv1alpha1.FactorioServerSpec{
				Version: testServerVersion,
				Server: &gamesv1alpha1.ServerSettingsSpec{
					Identity: &gamesv1alpha1.ServerIdentitySpec{
						Name: new("Test Server"),
					},
					Access: &gamesv1alpha1.AccessControlSpec{
						MaxPlayers: new(int32(8)),
						GamePasswordRef: &corev1.SecretKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{
								Name: credentialsName,
							},
							Key: "game-password",
						},
					},
				},
				MapGenSettings: &gamesv1alpha1.MapGenSettingsSpec{
					Seed: new(int64(42)),
				},
			},
		}
		Expect(k8sClient.Create(ctx, resource)).To(Succeed())
	})

	AfterEach(func() {
		By("cleaning up the owned resources and the custom resource")

		// envtest does not run the PVC protection controller, so the
		// kubernetes.io/pvc-protection finalizer is never removed and the
		// claim would stay behind. Strip it before deleting.
		for _, pvcKey := range []types.NamespacedName{claimKey} {
			var pvc corev1.PersistentVolumeClaim
			err := k8sClient.Get(ctx, pvcKey, &pvc)
			if err == nil {
				pvc.Finalizers = nil
				Expect(k8sClient.Update(ctx, &pvc)).To(Succeed())
				Expect(k8sClient.Delete(ctx, &pvc)).To(Succeed())
			} else {
				Expect(apierrors.IsNotFound(err)).To(BeTrue())
			}
		}

		owned := []client.Object{
			&appsv1.Deployment{
				ObjectMeta: metav1.ObjectMeta{
					Name:      resourceName,
					Namespace: resourceNamespace,
				},
			},
			&corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      serverSettingsKey.Name,
					Namespace: resourceNamespace,
				},
			},
			&corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      rconSecretKey.Name,
					Namespace: resourceNamespace,
				},
			},
			&corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      mapGenSettingsKey.Name,
					Namespace: resourceNamespace,
				},
			},
			&corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      mapSettingsKey.Name,
					Namespace: resourceNamespace,
				},
			},
			&corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      effectiveSettingsKey.Name,
					Namespace: resourceNamespace,
				},
			},
			&corev1.Service{
				ObjectMeta: metav1.ObjectMeta{
					Name:      resourceName,
					Namespace: resourceNamespace,
				},
			},
			&corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      credentialsName,
					Namespace: resourceNamespace,
				},
			},
			&gamesv1alpha1.FactorioServer{
				ObjectMeta: metav1.ObjectMeta{
					Name:      resourceName,
					Namespace: resourceNamespace,
				},
			},
		}

		for _, obj := range owned {
			err := k8sClient.Delete(ctx, obj)
			if err != nil && !apierrors.IsNotFound(err) {
				Expect(err).NotTo(HaveOccurred())
			}
		}
	})

	It("creates the settings objects and the Deployment", func() {
		result, err := reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: key,
		})
		Expect(err).NotTo(HaveOccurred())
		Expect(result.RequeueAfter).To(Equal(resyncInterval))

		var deployment appsv1.Deployment
		Expect(k8sClient.Get(ctx, key, &deployment)).To(Succeed())
		Expect(deployment.Spec.Template.Annotations).To(
			HaveKey(factorioresources.PodTemplateHashAnnotation))
		Expect(deployment.Spec.Strategy.Type).To(
			Equal(appsv1.RecreateDeploymentStrategyType))
		Expect(deployment.Spec.Template.Spec.InitContainers).To(HaveLen(1))
		Expect(deployment.Spec.Template.Spec.Volumes).To(HaveLen(7))
		Expect(deployment.Spec.Template.Spec.Containers).To(HaveLen(2))
		Expect(deployment.Spec.Template.Spec.Containers[0].VolumeMounts).To(HaveLen(7))
		Expect(deployment.Spec.Template.Spec.Containers[1].Name).To(Equal("saves"))
		Expect(deployment.Spec.Template.Annotations).To(
			HaveKey(factorioresources.RconPasswordHashAnnotation))
		Expect(deployment.Spec.Template.Spec.Containers[0].Resources.Requests.Cpu().String()).To(Equal("500m"))
		Expect(deployment.Spec.Template.Spec.Containers[0].Resources.Limits.Memory().String()).To(Equal("4Gi"))
		Expect(deployment.Spec.Template.Spec.TerminationGracePeriodSeconds).NotTo(BeNil())
		Expect(*deployment.Spec.Template.Spec.TerminationGracePeriodSeconds).To(BeEquivalentTo(120))

		server := &gamesv1alpha1.FactorioServer{}
		Expect(k8sClient.Get(ctx, key, server)).To(Succeed())
		Expect(metav1.IsControlledBy(&deployment, server)).To(BeTrue())

		available := meta.FindStatusCondition(server.Status.Conditions,
			ConditionAvailable)
		Expect(available).NotTo(BeNil())
		Expect(available.Status).To(Equal(metav1.ConditionFalse))

		progressing := meta.FindStatusCondition(server.Status.Conditions,
			ConditionProgressing)
		Expect(progressing).NotTo(BeNil())
		Expect(progressing.Status).To(Equal(metav1.ConditionTrue))

		degraded := meta.FindStatusCondition(server.Status.Conditions,
			ConditionDegraded)
		Expect(degraded).NotTo(BeNil())
		Expect(degraded.Status).To(Equal(metav1.ConditionFalse))

		events := drainEvents(recorder)
		Expect(events).To(ContainElement(ContainSubstring("Created Deployment")))
		Expect(events).To(ContainElement(ContainSubstring("Created Service")))
		Expect(events).To(ContainElement(
			ContainSubstring("Created PersistentVolumeClaim")))

		var settingsSecret corev1.Secret
		Expect(k8sClient.Get(ctx, serverSettingsKey, &settingsSecret)).To(Succeed())
		Expect(settingsSecret.Data).To(HaveKey("server-settings.json"))
		Expect(string(settingsSecret.Data["server-settings.json"])).To(
			ContainSubstring(`"game_password": "hunter2"`))

		var mapGenSettings corev1.ConfigMap
		Expect(k8sClient.Get(ctx, mapGenSettingsKey, &mapGenSettings)).To(Succeed())
		Expect(mapGenSettings.Data["map-gen-settings.json"]).To(
			ContainSubstring(`"seed": 42`))

		var mapSettings corev1.ConfigMap
		Expect(k8sClient.Get(ctx, mapSettingsKey, &mapSettings)).To(Succeed())
		Expect(mapSettings.Data["map-settings.json"]).To(
			ContainSubstring(`"max_failed_behavior_count": 3`))

		var effective corev1.ConfigMap
		Expect(k8sClient.Get(ctx, effectiveSettingsKey, &effective)).To(Succeed())
		Expect(effective.Data).To(HaveKey("defaults.json"))
		Expect(effective.Data).To(HaveKey("effective.json"))

		var effectiveSpec map[string]any
		Expect(json.Unmarshal(
			[]byte(effective.Data["effective.json"]),
			&effectiveSpec,
		)).To(Succeed())
		storage := effectiveSpec["storage"].(map[string]any)
		Expect(storage["size"]).To(Equal("10Gi"))
		Expect(effectiveSpec).NotTo(HaveKey("backup"))
		resources := effectiveSpec["resources"].(map[string]any)
		Expect(resources["cpuRequest"]).To(Equal("500m"))
		Expect(resources["memoryLimit"]).To(Equal("4Gi"))

		var claim corev1.PersistentVolumeClaim
		Expect(k8sClient.Get(ctx, claimKey, &claim)).To(Succeed())
		Expect(metav1.IsControlledBy(&claim, server)).To(BeTrue())
		Expect(claim.Spec.AccessModes).To(ContainElement(corev1.ReadWriteOnce))

		var rconSecret corev1.Secret
		Expect(k8sClient.Get(ctx, rconSecretKey, &rconSecret)).To(Succeed())
		Expect(metav1.IsControlledBy(&rconSecret, server)).To(BeTrue())
		Expect(rconSecret.Data).To(HaveKey(factorioresources.RconPasswordKey))
		Expect(rconSecret.Data[factorioresources.RconPasswordKey]).NotTo(BeEmpty())

		var service corev1.Service
		Expect(k8sClient.Get(ctx, key, &service)).To(Succeed())
		Expect(metav1.IsControlledBy(&service, server)).To(BeTrue())
		Expect(service.Spec.Ports).To(HaveLen(1))
		Expect(service.Spec.Ports[0].Protocol).To(Equal(corev1.ProtocolUDP))
		Expect(service.Spec.Ports[0].Port).To(BeEquivalentTo(34197))
	})

	It("adopts a data PVC kept from a previous server", func() {
		const adoptedName = "adopted-server"
		serverKey := types.NamespacedName{
			Name:      adoptedName,
			Namespace: resourceNamespace,
		}
		adoptedClaimKey := types.NamespacedName{
			Name:      adoptedName + "-data",
			Namespace: resourceNamespace,
		}

		DeferCleanup(func() {
			var claim corev1.PersistentVolumeClaim
			if err := k8sClient.Get(ctx, adoptedClaimKey, &claim); err == nil {
				claim.Finalizers = nil
				_ = k8sClient.Update(ctx, &claim)
				_ = k8sClient.Delete(ctx, &claim)
			}
			var server gamesv1alpha1.FactorioServer
			if err := k8sClient.Get(ctx, serverKey, &server); err == nil {
				_ = k8sClient.Delete(ctx, &server)
			}
		})

		server := &gamesv1alpha1.FactorioServer{
			ObjectMeta: metav1.ObjectMeta{
				Name:      adoptedName,
				Namespace: resourceNamespace,
			},
			Spec: gamesv1alpha1.FactorioServerSpec{Version: testServerVersion},
		}
		Expect(k8sClient.Create(ctx, server)).To(Succeed())

		claim, err := factorioresources.BuildPersistentVolumeClaim(server)
		Expect(err).NotTo(HaveOccurred())
		claim.Annotations = map[string]string{
			factorioresources.KeepPVCAnnotation: "true",
		}
		Expect(k8sClient.Create(ctx, claim)).To(Succeed())

		Expect(reconciler.reconcilePersistentVolumeClaim(ctx, server)).To(Succeed())

		var current corev1.PersistentVolumeClaim
		Expect(k8sClient.Get(ctx, adoptedClaimKey, &current)).To(Succeed())
		Expect(metav1.IsControlledBy(&current, server)).To(BeTrue())
		Expect(current.Annotations).NotTo(
			HaveKey(factorioresources.KeepPVCAnnotation))
		Expect(drainEvents(recorder)).To(ContainElement(
			ContainSubstring("Adopted PersistentVolumeClaim")))
	})

	It("does not adopt a kept PVC while the server is being deleted", func() {
		const pendingName = "pending-server"
		serverKey := types.NamespacedName{
			Name:      pendingName,
			Namespace: resourceNamespace,
		}
		pendingClaimKey := types.NamespacedName{
			Name:      pendingName + "-data",
			Namespace: resourceNamespace,
		}

		DeferCleanup(func() {
			var claim corev1.PersistentVolumeClaim
			if err := k8sClient.Get(ctx, pendingClaimKey, &claim); err == nil {
				claim.Finalizers = nil
				_ = k8sClient.Update(ctx, &claim)
				_ = k8sClient.Delete(ctx, &claim)
			}
			var server gamesv1alpha1.FactorioServer
			if err := k8sClient.Get(ctx, serverKey, &server); err == nil {
				_ = k8sClient.Delete(ctx, &server)
			}
		})

		server := &gamesv1alpha1.FactorioServer{
			ObjectMeta: metav1.ObjectMeta{
				Name:      pendingName,
				Namespace: resourceNamespace,
				Annotations: map[string]string{
					factorioresources.KeepPVCPendingAnnotation: annotationTrue,
				},
			},
			Spec: gamesv1alpha1.FactorioServerSpec{Version: testServerVersion},
		}
		Expect(k8sClient.Create(ctx, server)).To(Succeed())

		claim, err := factorioresources.BuildPersistentVolumeClaim(server)
		Expect(err).NotTo(HaveOccurred())
		claim.Annotations = map[string]string{
			factorioresources.KeepPVCAnnotation: annotationTrue,
		}
		Expect(k8sClient.Create(ctx, claim)).To(Succeed())

		Expect(reconciler.reconcilePersistentVolumeClaim(ctx, server)).To(Succeed())

		var current corev1.PersistentVolumeClaim
		Expect(k8sClient.Get(ctx, pendingClaimKey, &current)).To(Succeed())
		Expect(metav1.IsControlledBy(&current, server)).To(BeFalse())
		Expect(current.Annotations).To(
			HaveKey(factorioresources.KeepPVCAnnotation))
	})

	It("refuses to adopt a data PVC without the keep annotation", func() {
		const foreignName = "foreign-server"
		serverKey := types.NamespacedName{
			Name:      foreignName,
			Namespace: resourceNamespace,
		}
		foreignClaimKey := types.NamespacedName{
			Name:      foreignName + "-data",
			Namespace: resourceNamespace,
		}

		DeferCleanup(func() {
			var claim corev1.PersistentVolumeClaim
			if err := k8sClient.Get(ctx, foreignClaimKey, &claim); err == nil {
				claim.Finalizers = nil
				_ = k8sClient.Update(ctx, &claim)
				_ = k8sClient.Delete(ctx, &claim)
			}
			var server gamesv1alpha1.FactorioServer
			if err := k8sClient.Get(ctx, serverKey, &server); err == nil {
				_ = k8sClient.Delete(ctx, &server)
			}
		})

		server := &gamesv1alpha1.FactorioServer{
			ObjectMeta: metav1.ObjectMeta{
				Name:      foreignName,
				Namespace: resourceNamespace,
			},
			Spec: gamesv1alpha1.FactorioServerSpec{Version: testServerVersion},
		}
		Expect(k8sClient.Create(ctx, server)).To(Succeed())

		claim, err := factorioresources.BuildPersistentVolumeClaim(server)
		Expect(err).NotTo(HaveOccurred())
		Expect(k8sClient.Create(ctx, claim)).To(Succeed())

		err = reconciler.reconcilePersistentVolumeClaim(ctx, server)
		Expect(err).To(MatchError(ContainSubstring(
			"already exists and is not owned by")))
	})

	It("does not update an up-to-date Deployment", func() {
		_, err := reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: key,
		})
		Expect(err).NotTo(HaveOccurred())

		var first appsv1.Deployment
		Expect(k8sClient.Get(ctx, key, &first)).To(Succeed())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: key,
		})
		Expect(err).NotTo(HaveOccurred())

		var second appsv1.Deployment
		Expect(k8sClient.Get(ctx, key, &second)).To(Succeed())
		Expect(second.ResourceVersion).To(Equal(first.ResourceVersion))
	})

	It("updates the Deployment when the settings change", func() {
		_, err := reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: key,
		})
		Expect(err).NotTo(HaveOccurred())

		var first appsv1.Deployment
		Expect(k8sClient.Get(ctx, key, &first)).To(Succeed())
		firstHash := first.Spec.Template.Annotations[factorioresources.PodTemplateHashAnnotation]

		var stored gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, key, &stored)).To(Succeed())
		stored.Spec.MapGenSettings.Seed = new(int64(43))
		Expect(k8sClient.Update(ctx, &stored)).To(Succeed())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: key,
		})
		Expect(err).NotTo(HaveOccurred())

		var second appsv1.Deployment
		Expect(k8sClient.Get(ctx, key, &second)).To(Succeed())
		secondHash := second.Spec.Template.Annotations[factorioresources.PodTemplateHashAnnotation]
		Expect(secondHash).NotTo(Equal(firstHash))

		var mapGenSettings corev1.ConfigMap
		Expect(k8sClient.Get(ctx, mapGenSettingsKey, &mapGenSettings)).To(Succeed())
		Expect(mapGenSettings.Data["map-gen-settings.json"]).To(
			ContainSubstring(`"seed": 43`))
	})

	It("marks the server Available when the Deployment is available", func() {
		_, err := reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: key,
		})
		Expect(err).NotTo(HaveOccurred())

		var deployment appsv1.Deployment
		Expect(k8sClient.Get(ctx, key, &deployment)).To(Succeed())
		deployment.Status.Replicas = 1
		deployment.Status.ReadyReplicas = 1
		deployment.Status.AvailableReplicas = 1
		deployment.Status.UpdatedReplicas = 1
		deployment.Status.ObservedGeneration = deployment.Generation
		Expect(k8sClient.Status().Update(ctx, &deployment)).To(Succeed())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: key,
		})
		Expect(err).NotTo(HaveOccurred())

		var server gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, key, &server)).To(Succeed())

		available := meta.FindStatusCondition(server.Status.Conditions,
			ConditionAvailable)
		Expect(available).NotTo(BeNil())
		Expect(available.Status).To(Equal(metav1.ConditionTrue))

		progressing := meta.FindStatusCondition(server.Status.Conditions,
			ConditionProgressing)
		Expect(progressing).NotTo(BeNil())
		Expect(progressing.Status).To(Equal(metav1.ConditionFalse))

		degraded := meta.FindStatusCondition(server.Status.Conditions,
			ConditionDegraded)
		Expect(degraded).NotTo(BeNil())
		Expect(degraded.Status).To(Equal(metav1.ConditionFalse))
	})

	It("scales the Deployment down when the server is suspended", func() {
		_, err := reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: key,
		})
		Expect(err).NotTo(HaveOccurred())

		var deployment appsv1.Deployment
		Expect(k8sClient.Get(ctx, key, &deployment)).To(Succeed())
		Expect(*deployment.Spec.Replicas).To(BeEquivalentTo(1))

		var stored gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, key, &stored)).To(Succeed())
		stored.Spec.Suspended = true
		Expect(k8sClient.Update(ctx, &stored)).To(Succeed())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: key,
		})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, key, &deployment)).To(Succeed())
		Expect(*deployment.Spec.Replicas).To(BeEquivalentTo(0))

		var suspended gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, key, &suspended)).To(Succeed())

		available := meta.FindStatusCondition(suspended.Status.Conditions,
			ConditionAvailable)
		Expect(available).NotTo(BeNil())
		Expect(available.Status).To(Equal(metav1.ConditionFalse))
		Expect(available.Reason).To(Equal("Suspended"))

		Expect(drainEvents(recorder)).To(ContainElement(
			ContainSubstring("Suspended")))

		suspended.Spec.Suspended = false
		Expect(k8sClient.Update(ctx, &suspended)).To(Succeed())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: key,
		})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, key, &deployment)).To(Succeed())
		Expect(*deployment.Spec.Replicas).To(BeEquivalentTo(1))

		Expect(drainEvents(recorder)).To(ContainElement(
			ContainSubstring("Resumed")))
	})

	It("fails when the referenced Secret is missing", func() {
		credentials := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      credentialsName,
				Namespace: resourceNamespace,
			},
		}
		Expect(k8sClient.Delete(ctx, credentials)).To(Succeed())

		_, err := reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: key,
		})
		Expect(err).To(HaveOccurred())

		var server gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, key, &server)).To(Succeed())

		degraded := meta.FindStatusCondition(server.Status.Conditions,
			ConditionDegraded)
		Expect(degraded).NotTo(BeNil())
		Expect(degraded.Status).To(Equal(metav1.ConditionTrue))
		Expect(degraded.Reason).To(Equal("ReconcileFailed"))

		available := meta.FindStatusCondition(server.Status.Conditions,
			ConditionAvailable)
		Expect(available).NotTo(BeNil())
		Expect(available.Status).To(Equal(metav1.ConditionFalse))

		Expect(drainEvents(recorder)).To(ContainElement(
			ContainSubstring("ReconcileFailed")))
	})
})
