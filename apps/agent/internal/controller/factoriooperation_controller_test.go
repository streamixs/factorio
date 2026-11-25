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
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/record"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
)

var _ = Describe("FactorioOperation Controller", func() {
	const (
		operationServerName = "operation-server"
		operationNamespace  = "default"
		testSaveFile        = "_autosave2.zip"
	)

	var reconciler *FactorioOperationReconciler
	var recorder *record.FakeRecorder

	BeforeEach(func() {
		recorder = record.NewFakeRecorder(100)
		reconciler = &FactorioOperationReconciler{
			Client:   k8sClient,
			Recorder: recorder,
			Scheme:   k8sClient.Scheme(),
		}

		server := &gamesv1alpha1.FactorioServer{
			ObjectMeta: metav1.ObjectMeta{
				Name:      operationServerName,
				Namespace: operationNamespace,
			},
			Spec: gamesv1alpha1.FactorioServerSpec{Version: "2.1.24"},
		}
		Expect(k8sClient.Create(ctx, server)).To(Succeed())
	})

	AfterEach(func() {
		var operations gamesv1alpha1.FactorioOperationList
		Expect(k8sClient.List(ctx, &operations,
			client.InNamespace(operationNamespace))).To(Succeed())
		for i := range operations.Items {
			operation := &operations.Items[i]
			operation.Finalizers = nil
			_ = k8sClient.Update(ctx, operation)
			_ = k8sClient.Delete(ctx, operation)
		}

		var jobs batchv1.JobList
		Expect(k8sClient.List(ctx, &jobs,
			client.InNamespace(operationNamespace))).To(Succeed())
		for i := range jobs.Items {
			job := &jobs.Items[i]
			job.Finalizers = nil
			_ = k8sClient.Update(ctx, job)
			_ = k8sClient.Delete(ctx, job)
		}

		server := &gamesv1alpha1.FactorioServer{
			ObjectMeta: metav1.ObjectMeta{
				Name:      operationServerName,
				Namespace: operationNamespace,
			},
		}
		err := k8sClient.Delete(ctx, server)
		if err != nil {
			Expect(apierrors.IsNotFound(err)).To(BeTrue())
		}
	})

	It("suspends the server, runs the Job and resumes it", func() {
		operation := &gamesv1alpha1.FactorioOperation{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "restore-operation",
				Namespace: operationNamespace,
			},
			Spec: gamesv1alpha1.FactorioOperationSpec{
				ServerName: operationServerName,
				Type:       gamesv1alpha1.OperationRestore,
				SaveFile:   testSaveFile,
			},
		}
		Expect(k8sClient.Create(ctx, operation)).To(Succeed())

		key := types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operation.Name,
		}

		By("recording the operation and its initial server state")
		_, err := reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		var current gamesv1alpha1.FactorioOperation
		Expect(k8sClient.Get(ctx, key, &current)).To(Succeed())
		Expect(current.Status.Phase).To(Equal(gamesv1alpha1.OperationPhaseSuspending))
		Expect(current.Status.WasSuspended).To(BeFalse())

		var server gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeFalse())

		By("suspending the server and creating the Job")
		_, err = reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeTrue())

		Expect(k8sClient.Get(ctx, key, &current)).To(Succeed())
		Expect(current.Status.Phase).To(Equal(gamesv1alpha1.OperationPhaseRunning))
		Expect(current.Status.JobName).NotTo(BeEmpty())

		var job batchv1.Job
		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      current.Status.JobName,
		}, &job)).To(Succeed())
		Expect(job.Spec.Template.Spec.Containers[0].Env).To(ContainElement(
			corev1.EnvVar{Name: "SAVE_FILE", Value: testSaveFile}))

		By("marking the Job successful")
		job.Status.Succeeded = 1
		Expect(k8sClient.Status().Update(ctx, &job)).To(Succeed())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeFalse())

		Expect(k8sClient.Get(ctx, key, &current)).To(Succeed())
		Expect(current.Status.Phase).To(Equal(gamesv1alpha1.OperationPhaseCompleted))
		Expect(current.Status.CompletedAt).NotTo(BeNil())
	})

	It("leaves an already stopped server stopped", func() {
		var server gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		server.Spec.Suspended = true
		Expect(k8sClient.Update(ctx, &server)).To(Succeed())

		operation := &gamesv1alpha1.FactorioOperation{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "import-operation",
				Namespace: operationNamespace,
			},
			Spec: gamesv1alpha1.FactorioOperationSpec{
				ServerName: operationServerName,
				Type:       gamesv1alpha1.OperationImport,
				ImportURL:  "http://factorio-api/api/import",
			},
		}
		Expect(k8sClient.Create(ctx, operation)).To(Succeed())

		key := types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operation.Name,
		}

		_, err := reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		var current gamesv1alpha1.FactorioOperation
		Expect(k8sClient.Get(ctx, key, &current)).To(Succeed())
		Expect(current.Status.WasSuspended).To(BeTrue())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, key, &current)).To(Succeed())
		job := &batchv1.Job{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      current.Status.JobName,
		}, job)).To(Succeed())
		Expect(job.Spec.Template.Spec.Containers[0].Env).To(ContainElement(
			corev1.EnvVar{Name: "IMPORT_URL", Value: "http://factorio-api/api/import"}))

		job.Status.Succeeded = 1
		Expect(k8sClient.Status().Update(ctx, job)).To(Succeed())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeTrue())
	})

	It("rejects a second pending operation without restarting the server", func() {
		var server gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		server.Spec.Suspended = true
		Expect(k8sClient.Update(ctx, &server)).To(Succeed())

		first := &gamesv1alpha1.FactorioOperation{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "a-pending",
				Namespace: operationNamespace,
			},
			Spec: gamesv1alpha1.FactorioOperationSpec{
				ServerName: operationServerName,
				Type:       gamesv1alpha1.OperationRestore,
				SaveFile:   testSaveFile,
			},
		}
		second := &gamesv1alpha1.FactorioOperation{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "b-pending",
				Namespace: operationNamespace,
			},
			Spec: gamesv1alpha1.FactorioOperationSpec{
				ServerName: operationServerName,
				Type:       gamesv1alpha1.OperationRestore,
				SaveFile:   "_autosave3.zip",
			},
		}
		Expect(k8sClient.Create(ctx, first)).To(Succeed())
		Expect(k8sClient.Create(ctx, second)).To(Succeed())

		_, err := reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: types.NamespacedName{
				Namespace: operationNamespace,
				Name:      second.Name,
			},
		})
		Expect(err).NotTo(HaveOccurred())

		var current gamesv1alpha1.FactorioOperation
		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      second.Name,
		}, &current)).To(Succeed())
		Expect(current.Status.Phase).To(Equal(gamesv1alpha1.OperationPhaseFailed))
		Expect(current.Status.WasSuspended).To(BeTrue())
		Expect(current.Status.Message).To(ContainSubstring("a-pending"))

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeTrue())

		var jobs batchv1.JobList
		Expect(k8sClient.List(ctx, &jobs,
			client.InNamespace(operationNamespace))).To(Succeed())
		Expect(jobs.Items).To(BeEmpty())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: types.NamespacedName{
				Namespace: operationNamespace,
				Name:      first.Name,
			},
		})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      first.Name,
		}, &current)).To(Succeed())
		Expect(current.Status.Phase).To(Equal(gamesv1alpha1.OperationPhaseSuspending))
		Expect(current.Status.WasSuspended).To(BeTrue())
	})

	It("waits for the Job to disappear before resuming the server", func() {
		var server gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		server.Spec.Suspended = true
		Expect(k8sClient.Update(ctx, &server)).To(Succeed())

		job := &batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{
				Name:       "blocked-job",
				Namespace:  operationNamespace,
				Finalizers: []string{"test/finalizer"},
			},
			Spec: batchv1.JobSpec{
				Template: corev1.PodTemplateSpec{
					Spec: corev1.PodSpec{
						RestartPolicy: corev1.RestartPolicyNever,
						Containers: []corev1.Container{{
							Name:  "job",
							Image: "busybox:1.36",
						}},
					},
				},
			},
		}
		Expect(k8sClient.Create(ctx, job)).To(Succeed())

		operation := &gamesv1alpha1.FactorioOperation{
			ObjectMeta: metav1.ObjectMeta{
				Name:       "running-operation",
				Namespace:  operationNamespace,
				Finalizers: []string{operationFinalizer},
			},
			Spec: gamesv1alpha1.FactorioOperationSpec{
				ServerName: operationServerName,
				Type:       gamesv1alpha1.OperationRestore,
				SaveFile:   testSaveFile,
			},
		}
		Expect(k8sClient.Create(ctx, operation)).To(Succeed())
		operation.Status = gamesv1alpha1.FactorioOperationStatus{
			Phase:     gamesv1alpha1.OperationPhaseRunning,
			JobName:   job.Name,
			StartedAt: &metav1.Time{Time: time.Now().Add(-time.Minute)},
		}
		Expect(k8sClient.Status().Update(ctx, operation)).To(Succeed())
		Expect(k8sClient.Delete(ctx, operation)).To(Succeed())

		key := types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operation.Name,
		}

		_, err := reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeTrue())

		var current gamesv1alpha1.FactorioOperation
		Expect(k8sClient.Get(ctx, key, &current)).To(Succeed())
		Expect(current.DeletionTimestamp.IsZero()).To(BeFalse())
		Expect(current.Finalizers).To(ContainElement(operationFinalizer))

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      job.Name,
		}, job)).To(Succeed())
		job.Finalizers = nil
		Expect(k8sClient.Update(ctx, job)).To(Succeed())

		Eventually(func() bool {
			err := k8sClient.Get(ctx, types.NamespacedName{
				Namespace: operationNamespace,
				Name:      job.Name,
			}, &batchv1.Job{})
			return apierrors.IsNotFound(err)
		}, time.Second*5, time.Millisecond*100).Should(BeTrue())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Eventually(func() bool {
			err := k8sClient.Get(ctx, key, &gamesv1alpha1.FactorioOperation{})
			return apierrors.IsNotFound(err)
		}, time.Second*5, time.Millisecond*100).Should(BeTrue())

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeFalse())
	})

	It("waits for a timed-out Job to be deleted before resuming", func() {
		operation := &gamesv1alpha1.FactorioOperation{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "timeout-operation",
				Namespace: operationNamespace,
			},
			Spec: gamesv1alpha1.FactorioOperationSpec{
				ServerName: operationServerName,
				Type:       gamesv1alpha1.OperationRestore,
				SaveFile:   testSaveFile,
			},
		}
		Expect(k8sClient.Create(ctx, operation)).To(Succeed())

		key := types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operation.Name,
		}

		_, err := reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())
		_, err = reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		var current gamesv1alpha1.FactorioOperation
		Expect(k8sClient.Get(ctx, key, &current)).To(Succeed())
		Expect(current.Status.Phase).To(Equal(gamesv1alpha1.OperationPhaseRunning))

		var server gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeTrue())

		var job batchv1.Job
		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      current.Status.JobName,
		}, &job)).To(Succeed())
		job.Finalizers = append(job.Finalizers, "test/finalizer")
		Expect(k8sClient.Update(ctx, &job)).To(Succeed())

		current.Status.StartedAt = &metav1.Time{
			Time: time.Now().Add(-25 * time.Minute),
		}
		Expect(k8sClient.Status().Update(ctx, &current)).To(Succeed())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, key, &current)).To(Succeed())
		Expect(current.Status.Phase).To(Equal(gamesv1alpha1.OperationPhaseFailed))

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeTrue())

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      current.Status.JobName,
		}, &job)).To(Succeed())
		Expect(job.DeletionTimestamp.IsZero()).To(BeFalse())

		job.Finalizers = nil
		Expect(k8sClient.Update(ctx, &job)).To(Succeed())

		Eventually(func() bool {
			err := k8sClient.Get(ctx, types.NamespacedName{
				Namespace: operationNamespace,
				Name:      job.Name,
			}, &batchv1.Job{})
			return apierrors.IsNotFound(err)
		}, time.Second*5, time.Millisecond*100).Should(BeTrue())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeFalse())
	})

	It("schedules retention for a terminal operation", func() {
		operation := &gamesv1alpha1.FactorioOperation{
			ObjectMeta: metav1.ObjectMeta{
				Name:       "retained-operation",
				Namespace:  operationNamespace,
				Finalizers: []string{operationFinalizer},
			},
			Spec: gamesv1alpha1.FactorioOperationSpec{
				ServerName: operationServerName,
				Type:       gamesv1alpha1.OperationRestore,
				SaveFile:   testSaveFile,
			},
		}
		Expect(k8sClient.Create(ctx, operation)).To(Succeed())

		completedAt := metav1.Now()
		operation.Status = gamesv1alpha1.FactorioOperationStatus{
			Phase:       gamesv1alpha1.OperationPhaseCompleted,
			CompletedAt: &completedAt,
		}
		Expect(k8sClient.Status().Update(ctx, operation)).To(Succeed())

		key := types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operation.Name,
		}
		result, err := reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())
		Expect(result.RequeueAfter).To(BeNumerically(">", 0))

		var current gamesv1alpha1.FactorioOperation
		Expect(k8sClient.Get(ctx, key, &current)).To(Succeed())
		Expect(current.DeletionTimestamp.IsZero()).To(BeTrue())
	})

	It("deletes an expired terminal operation", func() {
		operation := &gamesv1alpha1.FactorioOperation{
			ObjectMeta: metav1.ObjectMeta{
				Name:       "expired-operation",
				Namespace:  operationNamespace,
				Finalizers: []string{operationFinalizer},
			},
			Spec: gamesv1alpha1.FactorioOperationSpec{
				ServerName: operationServerName,
				Type:       gamesv1alpha1.OperationRestore,
				SaveFile:   testSaveFile,
			},
		}
		Expect(k8sClient.Create(ctx, operation)).To(Succeed())

		completedAt := metav1.NewTime(time.Now().Add(-8 * 24 * time.Hour))
		operation.Status = gamesv1alpha1.FactorioOperationStatus{
			Phase:        gamesv1alpha1.OperationPhaseFailed,
			WasSuspended: true,
			StartedAt:    &completedAt,
			CompletedAt:  &completedAt,
		}
		Expect(k8sClient.Status().Update(ctx, operation)).To(Succeed())

		key := types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operation.Name,
		}
		_, err := reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		// The operation carries a finalizer, so run the deletion reconcile too.
		_, err = reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Eventually(func() bool {
			err := k8sClient.Get(ctx, key, &gamesv1alpha1.FactorioOperation{})
			return apierrors.IsNotFound(err)
		}, time.Second*5, time.Millisecond*100).Should(BeTrue())
	})

	It("does not resume a stopped server when deleting an expired operation", func() {
		var server gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		server.Spec.Suspended = true
		Expect(k8sClient.Update(ctx, &server)).To(Succeed())

		completedAt := metav1.NewTime(time.Now().Add(-8 * 24 * time.Hour))
		operation := &gamesv1alpha1.FactorioOperation{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "expired-delete-operation",
				Namespace: operationNamespace,
				Annotations: map[string]string{
					operationExpiredAnnotation: annotationTrue,
				},
				Finalizers: []string{operationFinalizer},
			},
			Spec: gamesv1alpha1.FactorioOperationSpec{
				ServerName: operationServerName,
				Type:       gamesv1alpha1.OperationRestore,
				SaveFile:   testSaveFile,
			},
		}
		Expect(k8sClient.Create(ctx, operation)).To(Succeed())
		operation.Status = gamesv1alpha1.FactorioOperationStatus{
			Phase:       gamesv1alpha1.OperationPhaseFailed,
			StartedAt:   &completedAt,
			CompletedAt: &completedAt,
		}
		Expect(k8sClient.Status().Update(ctx, operation)).To(Succeed())
		Expect(k8sClient.Delete(ctx, operation)).To(Succeed())

		key := types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operation.Name,
		}
		_, err := reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeTrue())

		Eventually(func() bool {
			err := k8sClient.Get(ctx, key, &gamesv1alpha1.FactorioOperation{})
			return apierrors.IsNotFound(err)
		}, time.Second*5, time.Millisecond*100).Should(BeTrue())
	})

	It("does not resume a server stopped after a failed operation", func() {
		var server gamesv1alpha1.FactorioServer
		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		server.Spec.Suspended = true
		Expect(k8sClient.Update(ctx, &server)).To(Succeed())

		completedAt := metav1.Now()
		operation := &gamesv1alpha1.FactorioOperation{
			ObjectMeta: metav1.ObjectMeta{
				Name:       "resumed-operation",
				Namespace:  operationNamespace,
				Finalizers: []string{operationFinalizer},
			},
			Spec: gamesv1alpha1.FactorioOperationSpec{
				ServerName: operationServerName,
				Type:       gamesv1alpha1.OperationRestore,
				SaveFile:   testSaveFile,
			},
		}
		Expect(k8sClient.Create(ctx, operation)).To(Succeed())
		operation.Status = gamesv1alpha1.FactorioOperationStatus{
			Phase:       gamesv1alpha1.OperationPhaseFailed,
			StartedAt:   &completedAt,
			CompletedAt: &completedAt,
		}
		Expect(k8sClient.Status().Update(ctx, operation)).To(Succeed())

		key := types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operation.Name,
		}
		_, err := reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeFalse())

		// Simulate the user stopping the server after the operation finished.
		server.Spec.Suspended = true
		Expect(k8sClient.Update(ctx, &server)).To(Succeed())

		_, err = reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		Expect(k8sClient.Get(ctx, types.NamespacedName{
			Namespace: operationNamespace,
			Name:      operationServerName,
		}, &server)).To(Succeed())
		Expect(server.Spec.Suspended).To(BeTrue())
	})
})
