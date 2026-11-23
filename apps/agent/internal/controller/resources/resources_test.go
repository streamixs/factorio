package resources

import (
	"path"
	"strings"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	"github.com/streamixs/factorio/apps/agent/internal/config"
)

const (
	testRconPassword = "test-rcon-password"
	testServerName   = "demo"
	testNamespace    = "games"
	testTrue         = "true"
)

func testServer() *gamesv1alpha1.FactorioServer {
	return &gamesv1alpha1.FactorioServer{
		ObjectMeta: metav1.ObjectMeta{Name: testServerName, Namespace: testNamespace},
		Spec:       gamesv1alpha1.FactorioServerSpec{Version: "2.1.24"},
	}
}

func testResourceRequirements() corev1.ResourceRequirements {
	return corev1.ResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("500m"),
			corev1.ResourceMemory: resource.MustParse("1Gi"),
		},
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("2"),
			corev1.ResourceMemory: resource.MustParse("4Gi"),
		},
	}
}

func TestBuildDeploymentMountsConfiguredFiles(t *testing.T) {
	files := ConfigFiles{
		ServerSettings: []byte(`{"name":"demo"}`),
		MapGenSettings: []byte(`{"seed":42}`),
	}

	deployment := BuildDeployment(testServer(), files, testRconPassword, testResourceRequirements())
	container := deployment.Spec.Template.Spec.Containers[0]

	if deployment.Spec.Template.Spec.AutomountServiceAccountToken == nil ||
		*deployment.Spec.Template.Spec.AutomountServiceAccountToken {
		t.Error("deployment automounts a service account token")
	}

	if got := deployment.Spec.Template.Annotations[PodTemplateHashAnnotation]; got == "" {
		t.Fatal("config hash annotation is empty")
	}

	if len(deployment.Spec.Template.Spec.Volumes) != 4 {
		t.Fatalf("got %d volumes, want 4",
			len(deployment.Spec.Template.Spec.Volumes))
	}

	if len(container.VolumeMounts) != 4 {
		t.Fatalf("got %d volume mounts, want 4", len(container.VolumeMounts))
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
	deployment := BuildDeployment(testServer(), ConfigFiles{}, testRconPassword, testResourceRequirements())

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

	if len(initContainers[0].VolumeMounts) != 1 ||
		initContainers[0].VolumeMounts[0].MountPath != dataDir {
		t.Error("init container does not mount the data volume")
	}
}

func TestBuildDeploymentConfiguresHealthProbes(t *testing.T) {
	container := BuildDeployment(testServer(), ConfigFiles{}, testRconPassword, testResourceRequirements()).
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
	deployment := BuildDeployment(testServer(), ConfigFiles{}, testRconPassword, testResourceRequirements())
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
	deployment := BuildDeployment(testServer(), files, testRconPassword, testResourceRequirements())
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

	deployment := BuildDeployment(server, ConfigFiles{}, testRconPassword, testResourceRequirements())

	if deployment.Spec.Replicas == nil || *deployment.Spec.Replicas != 0 {
		t.Errorf("replicas are %v, want 0", deployment.Spec.Replicas)
	}

	server.Spec.Suspended = false
	deployment = BuildDeployment(server, ConfigFiles{}, testRconPassword, testResourceRequirements())

	if deployment.Spec.Replicas == nil || *deployment.Spec.Replicas != 1 {
		t.Errorf("replicas are %v, want 1", deployment.Spec.Replicas)
	}
}

func TestBuildDeploymentWithoutSettings(t *testing.T) {
	server := testServer()
	server.Spec.Version = ""

	deployment := BuildDeployment(server, ConfigFiles{}, testRconPassword, testResourceRequirements())
	container := deployment.Spec.Template.Spec.Containers[0]

	if len(deployment.Spec.Template.Spec.Volumes) != 2 {
		t.Errorf("got %d volumes, want 2",
			len(deployment.Spec.Template.Spec.Volumes))
	}

	if len(container.VolumeMounts) != 2 {
		t.Errorf("got %d volume mounts, want 2", len(container.VolumeMounts))
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

	if env["GENERATE_NEW_SAVE"] != testTrue {
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

	first := base.Hash()
	second := base.Hash()
	if first != second {
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
	existing := BuildDeployment(server, ConfigFiles{}, testRconPassword, testResourceRequirements())

	same := BuildDeployment(server, ConfigFiles{}, testRconPassword, testResourceRequirements())
	if NeedsUpdate(&existing, &same) {
		t.Error("identical deployments need an update")
	}

	changedConfig := BuildDeployment(server, ConfigFiles{
		MapSettings: []byte("{}"),
	}, testRconPassword, testResourceRequirements())
	if !NeedsUpdate(&existing, &changedConfig) {
		t.Error("config change was not detected")
	}

	otherVersion := testServer()
	otherVersion.Spec.Version = "2.0.0"
	changedImage := BuildDeployment(otherVersion, ConfigFiles{}, testRconPassword, testResourceRequirements())
	if !NeedsUpdate(&existing, &changedImage) {
		t.Error("image change was not detected")
	}
}

func TestUpdateDeploymentCopiesConfigAndKeepsAnnotations(t *testing.T) {
	server := testServer()
	existing := BuildDeployment(server, ConfigFiles{}, testRconPassword, testResourceRequirements())
	existing.Spec.Template.Annotations["example.com/restarted"] = testTrue

	desired := BuildDeployment(server, ConfigFiles{
		ServerSettings: []byte("{}"),
	}, testRconPassword, testResourceRequirements())

	UpdateDeployment(&existing, &desired)

	if got, want := existing.Spec.Template.Annotations[PodTemplateHashAnnotation],
		desired.Spec.Template.Annotations[PodTemplateHashAnnotation]; got != want {
		t.Errorf("config hash is %q, want %q", got, want)
	}

	if existing.Spec.Template.Annotations["example.com/restarted"] != testTrue {
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

func TestBuildDeploymentServesSaves(t *testing.T) {
	deployment := BuildDeployment(testServer(), ConfigFiles{}, testRconPassword, testResourceRequirements())

	if len(deployment.Spec.Template.Spec.Containers) != 2 {
		t.Fatalf("got %d containers, want 2",
			len(deployment.Spec.Template.Spec.Containers))
	}

	sidecar := deployment.Spec.Template.Spec.Containers[1]
	if sidecar.Name != savesSidecarContainer {
		t.Errorf("sidecar name is %q, want %q",
			sidecar.Name, savesSidecarContainer)
	}

	if sidecar.Image != savesImage {
		t.Errorf("sidecar image is %q", sidecar.Image)
	}

	if len(sidecar.Ports) != 1 || sidecar.Ports[0].ContainerPort != savesHTTPPort {
		t.Errorf("sidecar ports are %v", sidecar.Ports)
	}

	if len(sidecar.Command) != 3 ||
		!strings.Contains(sidecar.Command[2], "httpd -f -p 8080") ||
		!strings.Contains(sidecar.Command[2], "/factorio/saves") {
		t.Errorf("sidecar command is %v", sidecar.Command)
	}

	if len(sidecar.VolumeMounts) != 1 {
		t.Fatalf("got %d sidecar mounts, want 1", len(sidecar.VolumeMounts))
	}

	mount := sidecar.VolumeMounts[0]
	if mount.Name != dataVolume || mount.MountPath != dataDir {
		t.Errorf("sidecar mount is %+v, want the data volume", mount)
	}

	if mount.ReadOnly {
		t.Error("sidecar must write index.txt in the saves directory")
	}

	for _, volume := range deployment.Spec.Template.Spec.Volumes {
		if volume.Name == "backups" {
			t.Error("the removed backup volume is still present")
		}
	}
}

func TestBuildDeploymentIncludesRcon(t *testing.T) {
	deployment := BuildDeployment(testServer(), ConfigFiles{}, testRconPassword, testResourceRequirements())
	container := deployment.Spec.Template.Spec.Containers[0]

	var volume *corev1.Volume
	for i := range deployment.Spec.Template.Spec.Volumes {
		if deployment.Spec.Template.Spec.Volumes[i].Name == rconName {
			volume = &deployment.Spec.Template.Spec.Volumes[i]
		}
	}
	if volume == nil || volume.Secret == nil ||
		volume.Secret.SecretName != "demo-rcon" {
		t.Fatalf("rcon volume is %+v", volume)
	}

	var mount *corev1.VolumeMount
	for i := range container.VolumeMounts {
		if container.VolumeMounts[i].Name == rconName {
			mount = &container.VolumeMounts[i]
		}
	}
	if mount == nil ||
		mount.MountPath != path.Join(configDir, RconPasswordKey) ||
		mount.SubPath != RconPasswordKey || !mount.ReadOnly {
		t.Fatalf("rcon mount is %+v", mount)
	}

	if got := deployment.Spec.Template.Annotations[RconPasswordHashAnnotation]; got == "" {
		t.Error("rcon password hash annotation is empty")
	}

	if len(container.Ports) != 2 || container.Ports[1].Name != rconName ||
		container.Ports[1].ContainerPort != rconPort {
		t.Errorf("rcon port is missing: %v", container.Ports)
	}
}

func TestBuildDeploymentChangesHashWithRconPassword(t *testing.T) {
	base := BuildDeployment(testServer(), ConfigFiles{}, "first-password", testResourceRequirements())
	changed := BuildDeployment(testServer(), ConfigFiles{}, "second-password", testResourceRequirements())

	if base.Spec.Template.Annotations[PodTemplateHashAnnotation] ==
		changed.Spec.Template.Annotations[PodTemplateHashAnnotation] {
		t.Error("an RCON password change does not change the pod template hash")
	}
}

func TestBuildRconSecret(t *testing.T) {
	secret := BuildRconSecret(testServer(), "hunter2")

	if got, want := secret.Name, "demo-rcon"; got != want {
		t.Errorf("secret name is %q, want %q", got, want)
	}
	if got := string(secret.Data[RconPasswordKey]); got != "hunter2" {
		t.Errorf("rcon password is %q", got)
	}
	if secret.Type != corev1.SecretTypeOpaque {
		t.Errorf("secret type is %q", secret.Type)
	}
}

func TestGenerateRconPassword(t *testing.T) {
	first, err := GenerateRconPassword()
	if err != nil {
		t.Fatalf("generate password: %v", err)
	}
	second, err := GenerateRconPassword()
	if err != nil {
		t.Fatalf("generate password: %v", err)
	}

	if first == second {
		t.Error("generated passwords are identical")
	}
	if len(first) < 16 {
		t.Errorf("password is too short: %q", first)
	}
}

func TestBuildResourcesUsesDefaults(t *testing.T) {
	resources, err := BuildResources(testServer())
	if err != nil {
		t.Fatalf("build resources: %v", err)
	}

	assertQuantity(t, resources.Requests, corev1.ResourceCPU, defaultCPURequest)
	assertQuantity(t, resources.Requests, corev1.ResourceMemory, defaultMemoryRequest)
	assertQuantity(t, resources.Limits, corev1.ResourceCPU, defaultCPULimit)
	assertQuantity(t, resources.Limits, corev1.ResourceMemory, defaultMemoryLimit)
}

func TestBuildResourcesUsesSpec(t *testing.T) {
	server := testServer()
	server.Spec.Resources = &gamesv1alpha1.ResourcesSpec{
		CPURequest:    "250m",
		CPULimit:      "1",
		MemoryRequest: "512Mi",
		MemoryLimit:   "2Gi",
	}

	resources, err := BuildResources(server)
	if err != nil {
		t.Fatalf("build resources: %v", err)
	}

	assertQuantity(t, resources.Requests, corev1.ResourceCPU, "250m")
	assertQuantity(t, resources.Limits, corev1.ResourceCPU, "1")
	assertQuantity(t, resources.Requests, corev1.ResourceMemory, "512Mi")
	assertQuantity(t, resources.Limits, corev1.ResourceMemory, "2Gi")
}

func TestBuildResourcesRejectsInvalidQuantity(t *testing.T) {
	server := testServer()
	server.Spec.Resources = &gamesv1alpha1.ResourcesSpec{CPURequest: "nope"}

	if _, err := BuildResources(server); err == nil {
		t.Fatal("expected an error, got nil")
	}
}

func TestBuildResourcesRejectsLimitBelowRequest(t *testing.T) {
	server := testServer()
	server.Spec.Resources = &gamesv1alpha1.ResourcesSpec{
		CPURequest: "2",
		CPULimit:   "1",
	}

	if _, err := BuildResources(server); err == nil {
		t.Fatal("expected an error, got nil")
	}
}

func TestBuildDeploymentUsesResources(t *testing.T) {
	deployment := BuildDeployment(testServer(), ConfigFiles{},
		testRconPassword, testResourceRequirements())
	container := deployment.Spec.Template.Spec.Containers[0]

	assertQuantity(t, container.Resources.Requests, corev1.ResourceCPU,
		defaultCPURequest)
	assertQuantity(t, container.Resources.Limits, corev1.ResourceMemory,
		defaultMemoryLimit)
}

func TestBuildDeploymentSetsTerminationGracePeriod(t *testing.T) {
	deployment := BuildDeployment(testServer(), ConfigFiles{},
		testRconPassword, testResourceRequirements())

	grace := deployment.Spec.Template.Spec.TerminationGracePeriodSeconds
	if grace == nil || *grace != terminationGracePeriodSeconds {
		t.Errorf("termination grace period is %v, want %d", grace,
			terminationGracePeriodSeconds)
	}
}

func assertQuantity(
	t *testing.T,
	list corev1.ResourceList,
	name corev1.ResourceName,
	want string,
) {
	t.Helper()
	quantity, ok := list[name]
	if !ok {
		t.Errorf("%s is missing", name)
		return
	}
	if got := quantity.String(); got != want {
		t.Errorf("%s is %q, want %q", name, got, want)
	}
}

func TestBuildOperationJobRestore(t *testing.T) {
	operation := &gamesv1alpha1.FactorioOperation{
		ObjectMeta: metav1.ObjectMeta{Name: "demo-restore", Namespace: testNamespace},
		Spec: gamesv1alpha1.FactorioOperationSpec{
			ServerName: testServerName,
			Type:       gamesv1alpha1.OperationRestore,
			SaveFile:   "_autosave2.zip",
		},
	}

	job := BuildOperationJob(operation, testServer())

	if job.Spec.Template.Spec.AutomountServiceAccountToken == nil ||
		*job.Spec.Template.Spec.AutomountServiceAccountToken {
		t.Error("operation job automounts a service account token")
	}

	if got, want := job.Name, "demo-restore-job"; got != want {
		t.Errorf("job name is %q, want %q", got, want)
	}
	if job.Namespace != testNamespace {
		t.Errorf("job namespace is %q", job.Namespace)
	}

	container := job.Spec.Template.Spec.Containers[0]
	env := envMap(container.Env)
	if env["SAVE_FILE"] != "_autosave2.zip" {
		t.Errorf("SAVE_FILE is %q", env["SAVE_FILE"])
	}
	if env["TARGET_SAVE"] != targetSaveName {
		t.Errorf("TARGET_SAVE is %q", env["TARGET_SAVE"])
	}
	if !strings.Contains(container.Command[2], "pre-restore-") ||
		!strings.Contains(container.Command[2], `cp "/factorio/saves/$SAVE_FILE"`) {
		t.Errorf("restore script is %q", container.Command[2])
	}

	claim := job.Spec.Template.Spec.Volumes[0].PersistentVolumeClaim
	if claim == nil || claim.ClaimName != "demo-data" {
		t.Errorf("operation job does not mount the data claim: %+v", claim)
	}
	if job.Spec.ActiveDeadlineSeconds == nil ||
		*job.Spec.ActiveDeadlineSeconds != operationDeadline {
		t.Errorf("active deadline is %v", job.Spec.ActiveDeadlineSeconds)
	}
}

func TestBuildOperationJobImport(t *testing.T) {
	operation := &gamesv1alpha1.FactorioOperation{
		ObjectMeta: metav1.ObjectMeta{Name: "demo-import", Namespace: testNamespace},
		Spec: gamesv1alpha1.FactorioOperationSpec{
			ServerName: testServerName,
			Type:       gamesv1alpha1.OperationImport,
			ImportURL:  "http://factorio-api/api/imports/token",
		},
	}

	job := BuildOperationJob(operation, testServer())
	container := job.Spec.Template.Spec.Containers[0]
	env := envMap(container.Env)

	if env["IMPORT_URL"] != "http://factorio-api/api/imports/token" {
		t.Errorf("IMPORT_URL is %q", env["IMPORT_URL"])
	}
	if !strings.Contains(container.Command[2], "wget -q -O") ||
		!strings.Contains(container.Command[2], "pre-import-") {
		t.Errorf("import script is %q", container.Command[2])
	}
}

func TestOperationJobNameKeepsShortNames(t *testing.T) {
	operation := &gamesv1alpha1.FactorioOperation{
		ObjectMeta: metav1.ObjectMeta{Name: "demo-restore-abcde"},
	}

	if got, want := OperationJobName(operation), "demo-restore-abcde-job"; got != want {
		t.Errorf("job name is %q, want %q", got, want)
	}
}

func TestOperationJobNameTruncatesAndHashes(t *testing.T) {
	first := &gamesv1alpha1.FactorioOperation{
		ObjectMeta: metav1.ObjectMeta{Name: strings.Repeat("a", 70)},
	}
	second := &gamesv1alpha1.FactorioOperation{
		ObjectMeta: metav1.ObjectMeta{Name: strings.Repeat("a", 69) + "b"},
	}

	firstJob := OperationJobName(first)
	if len(firstJob) > maxJobNameLength {
		t.Errorf("job name is %d characters, want at most %d",
			len(firstJob), maxJobNameLength)
	}
	if got := OperationJobName(first); got != firstJob {
		t.Errorf("job name is not deterministic: %q then %q", firstJob, got)
	}
	if secondJob := OperationJobName(second); secondJob == firstJob {
		t.Errorf("different long operation names produced the same job %q",
			firstJob)
	}
}

func envMap(values []corev1.EnvVar) map[string]string {
	result := make(map[string]string, len(values))
	for _, value := range values {
		result[value.Name] = value.Value
	}
	return result
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
	if got := secret.Labels["app.kubernetes.io/instance"]; got != testServerName {
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
		StorageClassName: new("fast"),
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

	if got, want := service.Name, testServerName; got != want {
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

	if got := service.Spec.Selector["app.kubernetes.io/instance"]; got != testServerName {
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
