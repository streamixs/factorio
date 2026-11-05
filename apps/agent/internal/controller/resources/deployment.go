package resources

import (
	"path"
	"strconv"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/equality"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	gamesv1alpha1 "github.com/streamixs/factorio/apps/agent/api/v1alpha1"
	"github.com/streamixs/factorio/apps/agent/internal/config"
)

const (
	defaultVersion = "2.1.0"
	configDir      = "/factorio/config"
	dataDir        = "/factorio"
	gamePort       = 34197
	saveName       = "_autosave1"
	prepareImage   = "busybox:1.36"

	dataVolume           = "data"
	serverSettingsVolume = "server-settings"
	mapGenSettingsVolume = "map-gen-settings"
	mapSettingsVolume    = "map-settings"

	prepareDataCommand = "mkdir -p /factorio/config /factorio/saves /factorio/mods"
	healthcheckPath    = "/docker-healthcheck.sh"
)

func labelsFor(server *gamesv1alpha1.FactorioServer) map[string]string {
	return map[string]string{
		"app":                        server.Name,
		"app.kubernetes.io/name":     "factorio",
		"app.kubernetes.io/instance": server.Name,
	}
}

// BuildDeployment builds the Deployment running the Factorio server. Settings
// files that are present in files are mounted read-only into the config
// directory, and their hash is recorded on the pod template.
func BuildDeployment(
	server *gamesv1alpha1.FactorioServer,
	files ConfigFiles,
) appsv1.Deployment {
	replicas := int32(1)
	if server.Spec.Suspended {
		replicas = 0
	}
	labels := labelsFor(server)
	volumes, mounts := configVolumes(server, files)
	volumes = append(volumes, dataVolumeFor(server))
	mounts = append(mounts, corev1.VolumeMount{
		Name:      dataVolume,
		MountPath: dataDir,
	})

	version := server.Spec.Version
	if version == "" {
		version = defaultVersion
	}

	deployment := appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      server.Name,
			Namespace: server.Namespace,
			Labels:    labels,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Strategy: appsv1.DeploymentStrategy{
				Type: appsv1.RecreateDeploymentStrategyType,
			},
			Selector: &metav1.LabelSelector{
				MatchLabels: labels,
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: labels,
					Annotations: map[string]string{
						ConfigHashAnnotation: files.Hash(),
					},
				},
				Spec: corev1.PodSpec{
					InitContainers: []corev1.Container{
						{
							Name:    "prepare-data",
							Image:   prepareImage,
							Command: []string{"sh", "-c", prepareDataCommand},
							VolumeMounts: []corev1.VolumeMount{
								{Name: dataVolume, MountPath: dataDir},
							},
						},
					},
					Volumes: volumes,
					Containers: []corev1.Container{
						{
							Name:  "factorio",
							Image: "factoriotools/factorio:" + version,
							Ports: []corev1.ContainerPort{
								{
									Name:          "game",
									ContainerPort: gamePort,
									Protocol:      corev1.ProtocolUDP,
								},
							},
							Env: []corev1.EnvVar{
								{Name: "GENERATE_NEW_SAVE", Value: "true"},
								{Name: "SAVE_NAME", Value: saveName},
								{Name: "PORT", Value: strconv.Itoa(gamePort)},
							},
							StartupProbe:   healthProbe(10, 60),
							ReadinessProbe: healthProbe(10, 3),
							LivenessProbe:  healthProbe(30, 3),
							VolumeMounts:   mounts,
						},
					},
				},
			},
		},
	}

	return deployment
}

func dataVolumeFor(server *gamesv1alpha1.FactorioServer) corev1.Volume {
	return corev1.Volume{
		Name: dataVolume,
		VolumeSource: corev1.VolumeSource{
			PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
				ClaimName: PersistentVolumeClaimName(server),
			},
		},
	}
}

// healthProbe builds a probe that runs the image's RCON healthcheck. It only
// succeeds once the server answers RCON, which means the world is loaded and
// players can connect.
func healthProbe(periodSeconds, failureThreshold int32) *corev1.Probe {
	return &corev1.Probe{
		ProbeHandler: corev1.ProbeHandler{
			Exec: &corev1.ExecAction{
				Command: []string{healthcheckPath},
			},
		},
		PeriodSeconds:    periodSeconds,
		TimeoutSeconds:   10,
		FailureThreshold: failureThreshold,
	}
}

// configVolumes returns the volumes and mounts for the settings files that are
// present. Each file is mounted with subPath so the rest of the config
// directory, which may hold server-id.json or rconpw, stays writable.
func configVolumes(
	server *gamesv1alpha1.FactorioServer,
	files ConfigFiles,
) ([]corev1.Volume, []corev1.VolumeMount) {
	volumes := make([]corev1.Volume, 0, 3)
	mounts := make([]corev1.VolumeMount, 0, 3)

	if files.ServerSettings != nil {
		volumes = append(volumes, corev1.Volume{
			Name: serverSettingsVolume,
			VolumeSource: corev1.VolumeSource{
				Secret: &corev1.SecretVolumeSource{
					SecretName: ServerSettingsSecretName(server),
				},
			},
		})
		mounts = append(mounts, configMount(serverSettingsVolume,
			config.ServerSettingsFile))
	}

	if files.MapGenSettings != nil {
		volumes = append(volumes, corev1.Volume{
			Name: mapGenSettingsVolume,
			VolumeSource: corev1.VolumeSource{
				ConfigMap: &corev1.ConfigMapVolumeSource{
					LocalObjectReference: corev1.LocalObjectReference{
						Name: MapGenSettingsConfigMapName(server),
					},
				},
			},
		})
		mounts = append(mounts, configMount(mapGenSettingsVolume,
			config.MapGenSettingsFile))
	}

	if files.MapSettings != nil {
		volumes = append(volumes, corev1.Volume{
			Name: mapSettingsVolume,
			VolumeSource: corev1.VolumeSource{
				ConfigMap: &corev1.ConfigMapVolumeSource{
					LocalObjectReference: corev1.LocalObjectReference{
						Name: MapSettingsConfigMapName(server),
					},
				},
			},
		})
		mounts = append(mounts, configMount(mapSettingsVolume,
			config.MapSettingsFile))
	}

	return volumes, mounts
}

func configMount(volumeName, fileName string) corev1.VolumeMount {
	return corev1.VolumeMount{
		Name:      volumeName,
		MountPath: path.Join(configDir, fileName),
		SubPath:   fileName,
		ReadOnly:  true,
	}
}

// NeedsUpdate reports whether existing differs from desired on a field the
// controller manages. The pod template is compared through the config hash
// rather than field by field, because the API server defaults many fields
// that are absent from the desired template.
func NeedsUpdate(existing, desired *appsv1.Deployment) bool {
	if !equality.Semantic.DeepEqual(existing.Spec.Replicas, desired.Spec.Replicas) {
		return true
	}

	if existing.Spec.Strategy.Type != desired.Spec.Strategy.Type {
		return true
	}

	existingInitContainers := existing.Spec.Template.Spec.InitContainers
	desiredInitContainers := desired.Spec.Template.Spec.InitContainers

	if len(existingInitContainers) != len(desiredInitContainers) {
		return true
	}

	for i := range desiredInitContainers {
		if existingInitContainers[i].Name != desiredInitContainers[i].Name {
			return true
		}

		if existingInitContainers[i].Image != desiredInitContainers[i].Image {
			return true
		}
	}

	existingHash := existing.Spec.Template.Annotations[ConfigHashAnnotation]
	desiredHash := desired.Spec.Template.Annotations[ConfigHashAnnotation]
	if existingHash != desiredHash {
		return true
	}

	existingContainers := existing.Spec.Template.Spec.Containers
	desiredContainers := desired.Spec.Template.Spec.Containers

	if len(existingContainers) != len(desiredContainers) {
		return true
	}

	for i := range desiredContainers {
		if existingContainers[i].Name != desiredContainers[i].Name {
			return true
		}

		if existingContainers[i].Image != desiredContainers[i].Image {
			return true
		}
	}

	return false
}

// UpdateDeployment applies the mutable parts of desired to existing. Other
// annotations on the pod template, such as a manual restart marker, are
// preserved.
func UpdateDeployment(existing, desired *appsv1.Deployment) {
	existing.Spec.Replicas = desired.Spec.Replicas
	existing.Spec.Strategy = desired.Spec.Strategy
	existing.Spec.Template.Spec.InitContainers = desired.Spec.Template.Spec.InitContainers
	existing.Spec.Template.Spec.Containers = desired.Spec.Template.Spec.Containers
	existing.Spec.Template.Spec.Volumes = desired.Spec.Template.Spec.Volumes

	if existing.Spec.Template.Annotations == nil {
		existing.Spec.Template.Annotations = map[string]string{}
	}
	for key, value := range desired.Spec.Template.Annotations {
		existing.Spec.Template.Annotations[key] = value
	}
}
