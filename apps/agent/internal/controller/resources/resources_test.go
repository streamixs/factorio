package resources

import (
	"path"
	"strings"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	"github.com/streamixs/factorio/apps/agent/internal/config"
)

func ptr[T any](value T) *T {
	return &value
}

func testServer() *gamesv1alpha1.FactorioServer {
	return &gamesv1alpha1.FactorioServer{
		ObjectMeta: metav1.ObjectMeta{Name: "demo", Namespace: "games"},
		Spec:       gamesv1alpha1.FactorioServerSpec{Version: "2.1.24"},
	}
}

func TestBuildDeploymentMountsConfiguredFiles(t *testing.T) {
	files := ConfigFiles{
		ServerSettings: []byte(`{"name":"demo"}`),
		MapGenSettings: []byte(`{"seed":42}`),
	}

	deployment := BuildDeployment(testServer(), files)
	container := deployment.Spec.Template.Spec.Containers[0]

	if got := deployment.Spec.Template.Annotations[PodTemplateHashAnnotation]; got == "" {
		t.Fatal("config hash annotation is empty")
	}

	if len(deployment.Spec.Template.Spec.Volumes) != 4 {
		t.Fatalf("got %d volumes, want 4",
			len(deployment.Spec.Template.Spec.Volumes))
	}

	if len(container.VolumeMounts) != 3 {
		t.Fatalf("got %d volume mounts, want 3", len(container.VolumeMounts))
	}

	mounts := make(map[string]corev1.VolumeMount, len(container.VolumeMounts))
	for _, mount := range container.VolumeMounts {
		mounts[mount.MountPath] = mount
	}

	if mount, ok := mounts[dataDir]; !ok {
		t.Error("no mount for the data volume")
	} else if mount.Name != dataVolume {
		t.Errorf("data mount uses volume %q, want %q", mount.Name, dataVolume)
	}

	for _, file := range []string{
		config.ServerSettingsFile,
		config.MapGenSettingsFile,
	} {
		mount, ok := mounts[path.Join(configDir, file)]
		if !ok {
			t.Errorf("no mount for %s", file)
			continue
		}

		if mount.SubPath != file {
			t.Errorf("mount %s has subPath %q, want %q",
				file, mount.SubPath, file)
		}

		if !mount.ReadOnly {
			t.Errorf("mount %s is not read-only", file)
		}
	}
}

func TestBuildDeploymentUsesRecreateAndPreparesData(t *testing.T) {
	deployment := BuildDeployment(testServer(), ConfigFiles{})

	if got := deployment.Spec.Strategy.Type; got != appsv1.RecreateDeploymentStrategyType {
		t.Errorf("got strategy %q, want Recreate", got)
	}

	initContainers := deployment.Spec.Template.Spec.InitContainers
	if len(initContainers) != 1 {
		t.Fatalf("got %d init containers, want 1", len(initContainers))
	}

	if initContainers[0].Name != "prepare-data" {
		t.Errorf("init container name is %q, want prepare-data",
			initContainers[0].Name)
	}

	if len(initContainers[0].VolumeMounts) != 2 ||
		initContainers[0].VolumeMounts[0].MountPath != dataDir ||
		initContainers[0].VolumeMounts[1].MountPath != backupDir {
		t.Error("init container does not mount the data and backup volumes")
	}
}

func TestBuildDeploymentConfiguresHealthProbes(t *testing.T) {
	container := BuildDeployment(testServer(), ConfigFiles{}).
		Spec.Template.Spec.Containers[0]

	probes := map[string]*corev1.Probe{
		"startup":   container.StartupProbe,
		"readiness": container.ReadinessProbe,
		"liveness":  container.LivenessProbe,
	}

	for name, probe := range probes {
		if probe == nil {
			t.Fatalf("%s probe is nil", name)
		}

		if probe.Exec == nil || len(probe.Exec.Command) != 1 ||
			probe.Exec.Command[0] != healthcheckPath {
			t.Errorf("%s probe does not run %s", name, healthcheckPath)
		}

		if probe.TimeoutSeconds != 10 {
			t.Errorf("%s probe timeout is %d, want 10",
				name, probe.TimeoutSeconds)
		}
	}

	if container.StartupProbe.FailureThreshold != 60 ||
		container.StartupProbe.PeriodSeconds != 10 {
		t.Error("startup probe does not allow ten minutes of startup")
	}

	if container.ReadinessProbe.PeriodSeconds != 30 ||
		container.ReadinessProbe.FailureThreshold != 3 {
		t.Error("unexpected readiness probe timing")
	}

	if container.LivenessProbe.PeriodSeconds != 60 ||
		container.LivenessProbe.FailureThreshold != 3 {
		t.Error("unexpected liveness probe timing")
	}
}

func TestBuildDeploymentRunsAsFactorioUser(t *testing.T) {
	deployment := BuildDeployment(testServer(), ConfigFiles{})
	container := deployment.Spec.Template.Spec.Containers[0]

	if container.SecurityContext == nil {
		t.Fatal("container security context is nil")
	}

	if container.SecurityContext.RunAsUser == nil ||
		*container.SecurityContext.RunAsUser != serverUserID {
		t.Errorf("runAsUser is %v, want %d",
			container.SecurityContext.RunAsUser, serverUserID)
	}

	if container.SecurityContext.RunAsNonRoot == nil ||
		!*container.SecurityContext.RunAsNonRoot {
		t.Error("runAsNonRoot is not enabled")
	}

	initContainer := deployment.Spec.Template.Spec.InitContainers[0]
	if len(initContainer.Command) != 3 ||
		!strings.Contains(initContainer.Command[2], "chown -R 845:845 /factorio") {
		t.Errorf("prepare-data command is %v", initContainer.Command)
	}
}

func TestPodTemplateHashChangesWithTemplate(t *testing.T) {
	files := ConfigFiles{}
	deployment := BuildDeployment(testServer(), files)
	baseHash := deployment.Spec.Template.Annotations[PodTemplateHashAnnotation]

	template := deployment.Spec.Template.DeepCopy()
	template.Spec.Containers[0].SecurityContext = nil

	if podTemplateHash(*template, files) == baseHash {
		t.Error("template change does not change the hash")
	}
}

func TestBuildDeploymentScalesToZeroWhenSuspended(t *testing.T) {
	server := testServer()
	server.Spec.Suspended = true

	deployment := BuildDeployment(server, ConfigFiles{})

	if deployment.Spec.Replicas == nil || *deployment.Spec.Replicas != 0 {
		t.Errorf("replicas are %v, want 0", deployment.Spec.Replicas)
	}

	server.Spec.Suspended = false
	deployment = BuildDeployment(server, ConfigFiles{})

	if deployment.Spec.Replicas == nil || *deployment.Spec.Replicas != 1 {
		t.Errorf("replicas are %v, want 1", deployment.Spec.Replicas)
	}
}

func TestBuildDeploymentWithoutSettings(t *testing.T) {
	server := testServer()
	server.Spec.Version = ""

	deployment := BuildDeployment(server, ConfigFiles{})
	container := deployment.Spec.Template.Spec.Containers[0]

	if len(deployment.Spec.Template.Spec.Volumes) != 2 {
		t.Errorf("got %d volumes, want 2",
			len(deployment.Spec.Template.Spec.Volumes))
	}

	if len(container.VolumeMounts) != 1 {
		t.Errorf("got %d volume mounts, want 1", len(container.VolumeMounts))
	}

	if got := container.VolumeMounts[0].MountPath; got != dataDir {
		t.Errorf("data mount path is %q, want %q", got, dataDir)
	}

	if got := deployment.Spec.Template.Spec.Volumes[0].
		PersistentVolumeClaim; got == nil ||
		got.ClaimName != PersistentVolumeClaimName(server) {
		t.Errorf("data volume does not reference claim %q",
			PersistentVolumeClaimName(server))
	}

	if want := "factoriotools/factorio:" + defaultVersion; container.Image != want {
		t.Errorf("got image %q, want %q", container.Image, want)
	}

	env := make(map[string]string, len(container.Env))
	for _, variable := range container.Env {
		env[variable.Name] = variable.Value
	}

	if env["GENERATE_NEW_SAVE"] != "true" {
		t.Errorf("GENERATE_NEW_SAVE is %q, want true", env["GENERATE_NEW_SAVE"])
	}

	if env["SAVE_NAME"] != saveName {
		t.Errorf("SAVE_NAME is %q, want %q", env["SAVE_NAME"], saveName)
	}

	if env["PORT"] != "34197" {
		t.Errorf("PORT is %q, want 34197", env["PORT"])
	}
}

func TestConfigFilesHash(t *testing.T) {
	base := ConfigFiles{ServerSettings: []byte("a")}

	if base.Hash() != base.Hash() {
		t.Error("hash is not stable")
	}

	if base.Hash() == (ConfigFiles{ServerSettings: []byte("b")}).Hash() {
		t.Error("different content produces the same hash")
	}

	if base.Hash() == (ConfigFiles{}).Hash() {
		t.Error("present and absent files produce the same hash")
	}

	if (ConfigFiles{}).Hash() == (ConfigFiles{MapSettings: []byte{}}).Hash() {
		t.Error("absent and empty files produce the same hash")
	}
}

func TestNeedsUpdate(t *testing.T) {
	server := testServer()
	existing := BuildDeployment(server, ConfigFiles{})

	same := BuildDeployment(server, ConfigFiles{})
	if NeedsUpdate(&existing, &same) {
		t.Error("identical deployments need an update")
	}

	changedConfig := BuildDeployment(server, ConfigFiles{
		MapSettings: []byte("{}"),
	})
	if !NeedsUpdate(&existing, &changedConfig) {
		t.Error("config change was not detected")
	}

	otherVersion := testServer()
	otherVersion.Spec.Version = "2.0.0"
	changedImage := BuildDeployment(otherVersion, ConfigFiles{})
	if !NeedsUpdate(&existing, &changedImage) {
		t.Error("image change was not detected")
	}
}

func TestUpdateDeploymentCopiesConfigAndKeepsAnnotations(t *testing.T) {
	server := testServer()
	existing := BuildDeployment(server, ConfigFiles{})
	existing.Spec.Template.Annotations["example.com/restarted"] = "true"

	desired := BuildDeployment(server, ConfigFiles{
		ServerSettings: []byte("{}"),
	})

	UpdateDeployment(&existing, &desired)

	if got, want := existing.Spec.Template.Annotations[PodTemplateHashAnnotation],
		desired.Spec.Template.Annotations[PodTemplateHashAnnotation]; got != want {
		t.Errorf("config hash is %q, want %q", got, want)
	}

	if existing.Spec.Template.Annotations["example.com/restarted"] != "true" {
		t.Error("unrelated annotation was lost")
	}

	if len(existing.Spec.Template.Spec.Volumes) != 3 {
		t.Errorf("got %d volumes, want 3",
			len(existing.Spec.Template.Spec.Volumes))
	}

	if len(existing.Spec.Template.Spec.InitContainers) != 1 {
		t.Errorf("got %d init containers, want 1",
			len(existing.Spec.Template.Spec.InitContainers))
	}
}

func TestBuildEffectiveSettingsConfigMap(t *testing.T) {
	server := testServer()

	configMap := BuildEffectiveSettingsConfigMap(
		server,
		[]byte(`{"maxPlayers":0}`),
		[]byte(`{"maxPlayers":8}`),
	)

	if got, want := configMap.Name, "demo-effective-settings"; got != want {
		t.Errorf("configmap name is %q, want %q", got, want)
	}
	if got := configMap.Data[DefaultsSettingsKey]; got != `{"maxPlayers":0}` {
		t.Errorf("defaults data is %q", got)
	}
	if got := configMap.Data[EffectiveSettingsKey]; got != `{"maxPlayers":8}` {
		t.Errorf("effective data is %q", got)
	}
}

func TestBuildBackupPersistentVolumeClaim(t *testing.T) {
	claim, err := BuildBackupPersistentVolumeClaim(testServer())
	if err != nil {
		t.Fatalf("build backup claim: %v", err)
	}

	if got, want := claim.Name, "demo-backups"; got != want {
		t.Errorf("claim name is %q, want %q", got, want)
	}

	storage := claim.Spec.Resources.Requests[corev1.ResourceStorage]
	if got := storage.String(); got != defaultBackupSize {
		t.Errorf("claim size is %q, want %q", got, defaultBackupSize)
	}

	server := testServer()
	server.Spec.Backup = &gamesv1alpha1.BackupSpec{Size: "20Gi"}
	claim, err = BuildBackupPersistentVolumeClaim(server)
	if err != nil {
		t.Fatalf("build backup claim: %v", err)
	}
	storage = claim.Spec.Resources.Requests[corev1.ResourceStorage]
	if got := storage.String(); got != "20Gi" {
		t.Errorf("claim size is %q, want 20Gi", got)
	}
}

func TestBuildDeploymentWithBackupSidecar(t *testing.T) {
	deployment := BuildDeployment(testServer(), ConfigFiles{})

	var backup *corev1.Container
	for i := range deployment.Spec.Template.Spec.Containers {
		if deployment.Spec.Template.Spec.Containers[i].Name == backupContainer {
			backup = &deployment.Spec.Template.Spec.Containers[i]
		}
	}
	if backup == nil {
		t.Fatal("backup sidecar is missing")
	}

	if backup.Image != backupImage {
		t.Errorf("backup image is %q", backup.Image)
	}
	if len(backup.Ports) != 1 || backup.Ports[0].ContainerPort != backupHTTPPort {
		t.Errorf("backup ports are %v", backup.Ports)
	}

	env := make(map[string]string, len(backup.Env))
	for _, variable := range backup.Env {
		env[variable.Name] = variable.Value
	}
	if env["INTERVAL_MINUTES"] != "60" {
		t.Errorf("INTERVAL_MINUTES is %q", env["INTERVAL_MINUTES"])
	}
	if env["RETENTION"] != "10" {
		t.Errorf("RETENTION is %q", env["RETENTION"])
	}

	if len(backup.VolumeMounts) != 2 {
		t.Fatalf("got %d backup mounts, want 2", len(backup.VolumeMounts))
	}
	if backup.VolumeMounts[0].MountPath != dataDir ||
		!backup.VolumeMounts[0].ReadOnly {
		t.Error("backup sidecar does not mount the data volume read-only")
	}
	if backup.VolumeMounts[1].MountPath != backupDir {
		t.Error("backup sidecar does not mount /backups")
	}
}

func TestBuildDeploymentWithoutBackups(t *testing.T) {
	server := testServer()
	server.Spec.Backup = &gamesv1alpha1.BackupSpec{Enabled: ptr(false)}

	deployment := BuildDeployment(server, ConfigFiles{})

	if len(deployment.Spec.Template.Spec.Containers) != 1 {
		t.Errorf("got %d containers, want 1",
			len(deployment.Spec.Template.Spec.Containers))
	}
	if len(deployment.Spec.Template.Spec.Volumes) != 1 {
		t.Errorf("got %d volumes, want 1",
			len(deployment.Spec.Template.Spec.Volumes))
	}
	if len(deployment.Spec.Template.Spec.InitContainers[0].VolumeMounts) != 1 {
		t.Error("backup volume is still mounted by the init container")
	}
}

func TestBuildSettingsObjects(t *testing.T) {
	server := testServer()

	secret := BuildServerSettingsSecret(server, []byte("{}"))
	if got, want := secret.Name, "demo-server-settings"; got != want {
		t.Errorf("secret name is %q, want %q", got, want)
	}
	if got := string(secret.Data[config.ServerSettingsFile]); got != "{}" {
		t.Errorf("secret content is %q, want {}", got)
	}
	if got := secret.Labels["app.kubernetes.io/instance"]; got != "demo" {
		t.Errorf("secret instance label is %q, want demo", got)
	}

	mapGen := BuildMapGenSettingsConfigMap(server, []byte("{}"))
	if got, want := mapGen.Name, "demo-map-gen-settings"; got != want {
		t.Errorf("map-gen configmap name is %q, want %q", got, want)
	}
	if got := mapGen.Data[config.MapGenSettingsFile]; got != "{}" {
		t.Errorf("map-gen configmap content is %q, want {}", got)
	}

	mapSettings := BuildMapSettingsConfigMap(server, []byte("{}"))
	if got, want := mapSettings.Name, "demo-map-settings"; got != want {
		t.Errorf("map configmap name is %q, want %q", got, want)
	}
	if got := mapSettings.Data[config.MapSettingsFile]; got != "{}" {
		t.Errorf("map configmap content is %q, want {}", got)
	}
}

func TestBuildPersistentVolumeClaim(t *testing.T) {
	server := testServer()

	claim, err := BuildPersistentVolumeClaim(server)
	if err != nil {
		t.Fatalf("build claim: %v", err)
	}

	if got, want := claim.Name, "demo-data"; got != want {
		t.Errorf("claim name is %q, want %q", got, want)
	}

	if len(claim.Spec.AccessModes) != 1 ||
		claim.Spec.AccessModes[0] != corev1.ReadWriteOnce {
		t.Errorf("claim access modes are %v, want ReadWriteOnce",
			claim.Spec.AccessModes)
	}

	storage := claim.Spec.Resources.Requests[corev1.ResourceStorage]
	if got := storage.String(); got != defaultStorageSize {
		t.Errorf("claim size is %q, want %q", got, defaultStorageSize)
	}

	if claim.Spec.StorageClassName != nil {
		t.Errorf("claim storage class is %q, want nil",
			*claim.Spec.StorageClassName)
	}
}

func TestBuildPersistentVolumeClaimUsesSpec(t *testing.T) {
	server := testServer()
	server.Spec.Storage = &gamesv1alpha1.StorageSpec{
		Size:             "20Gi",
		StorageClassName: ptr("fast"),
	}

	claim, err := BuildPersistentVolumeClaim(server)
	if err != nil {
		t.Fatalf("build claim: %v", err)
	}

	storage := claim.Spec.Resources.Requests[corev1.ResourceStorage]
	if got := storage.String(); got != "20Gi" {
		t.Errorf("claim size is %q, want 20Gi", got)
	}

	if claim.Spec.StorageClassName == nil ||
		*claim.Spec.StorageClassName != "fast" {
		t.Errorf("claim storage class is %v, want fast",
			claim.Spec.StorageClassName)
	}
}

func TestBuildPersistentVolumeClaimRejectsInvalidSize(t *testing.T) {
	server := testServer()
	server.Spec.Storage = &gamesv1alpha1.StorageSpec{Size: "not-a-quantity"}

	if _, err := BuildPersistentVolumeClaim(server); err == nil {
		t.Fatal("expected an error, got nil")
	}
}

func TestBuildService(t *testing.T) {
	service := BuildService(testServer())

	if got, want := service.Name, "demo"; got != want {
		t.Errorf("service name is %q, want %q", got, want)
	}

	if got := service.Spec.Type; got != corev1.ServiceTypeClusterIP {
		t.Errorf("service type is %q, want ClusterIP", got)
	}

	if len(service.Spec.Ports) != 1 {
		t.Fatalf("got %d ports, want 1", len(service.Spec.Ports))
	}

	port := service.Spec.Ports[0]
	if port.Name != "game" || port.Protocol != corev1.ProtocolUDP ||
		port.Port != gamePort || port.TargetPort.IntValue() != gamePort {
		t.Errorf("unexpected port definition: %+v", port)
	}

	if got := service.Spec.Selector["app.kubernetes.io/instance"]; got != "demo" {
		t.Errorf("service selector instance is %q, want demo", got)
	}
}

func TestBuildServiceUsesSpecType(t *testing.T) {
	server := testServer()
	server.Spec.Service = &gamesv1alpha1.ServiceSpec{
		Type: corev1.ServiceTypeLoadBalancer,
	}

	service := BuildService(server)
	if got := service.Spec.Type; got != corev1.ServiceTypeLoadBalancer {
		t.Errorf("service type is %q, want LoadBalancer", got)
	}
}

func TestNeedsServiceUpdate(t *testing.T) {
	existing := BuildService(testServer())

	same := BuildService(testServer())
	if NeedsServiceUpdate(existing, same) {
		t.Error("identical services need an update")
	}

	same.Spec.Ports[0].NodePort = 30000
	if NeedsServiceUpdate(existing, same) {
		t.Error("an allocated nodePort must be ignored")
	}

	other := testServer()
	other.Spec.Service = &gamesv1alpha1.ServiceSpec{
		Type: corev1.ServiceTypeNodePort,
	}
	changed := BuildService(other)
	if !NeedsServiceUpdate(existing, changed) {
		t.Error("service type change was not detected")
	}
}
