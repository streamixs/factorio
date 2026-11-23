import { MAP_GEN_SIZE_VALUES } from "../settings-schema";

import type { CredentialsFormValues, SelectOption } from "./types";

export const ADVANCED_OPTIONS: SelectOption[] = [
  { value: "", label: "Défaut" },
  { value: "true", label: "Tous les joueurs" },
  { value: "false", label: "Personne" },
  { value: "admins-only", label: "Admins uniquement" },
];

export const DIFFICULTY_OPTIONS: SelectOption[] = [
  { value: "", label: "Défaut" },
  { value: "0", label: "Normal" },
  { value: "1", label: "Coûteux" },
];

/** Factorio GUI positions for MapGenSize (0 or 1/6..6). */
export const MAP_GEN_SIZE_OPTIONS: SelectOption[] = MAP_GEN_SIZE_VALUES.map(
  (item) => ({ value: String(item.value), label: item.label }),
);

/**
 * Autocomplete values for fields where Factorio has no documented hard
 * maximum. The values are the defaults, GUI positions or common presets.
 */
export const SUGGESTIONS: Record<string, string[]> = {
  "spec.version": ["2.1.24"],
  "spec.server.access.maxPlayers": ["0", "4", "8", "16", "32", "64"],
  "spec.server.autoSave.interval": ["0", "5", "10", "15", "20", "30", "60"],
  "spec.server.autoSave.slots": ["1", "3", "5", "10"],
  "spec.server.playerManagement.afkAutokickInterval": [
    "0",
    "5",
    "10",
    "30",
    "60",
  ],
  "spec.server.playerManagement.maxUploadSlots": ["0", "4", "8", "16"],
  "spec.server.playerManagement.maxUploadKilobytesPerSecond": [
    "0",
    "128",
    "256",
    "512",
    "1024",
  ],
  "spec.server.playerManagement.minimumLatencyInTicks": ["0", "2", "5", "10"],
  "spec.server.playerManagement.maxHeartbeatsPerSecond": [
    "6",
    "30",
    "60",
    "90",
    "120",
    "180",
    "240",
  ],
  "spec.mapGenSettings.width": ["0", "128", "256", "512", "1024", "2048"],
  "spec.mapGenSettings.height": ["0", "128", "256", "512", "1024", "2048"],
  "spec.mapGenSettings.cliffSettings.cliffElevation0": ["0", "10", "20", "40"],
  "spec.mapGenSettings.cliffSettings.cliffElevationInterval": [
    "10",
    "20",
    "40",
    "80",
  ],
  "spec.mapGenSettings.cliffSettings.richness": ["0", "1", "5", "10"],
  "spec.mapSettings.pollution.diffusionRatio": ["0", "0.02", "0.05", "0.1"],
  "spec.mapSettings.pollution.minToDiffuse": ["0", "15", "30", "50"],
  "spec.mapSettings.pollution.ageing": ["0", "0.5", "1", "2"],
  "spec.mapSettings.pollution.expectedMaxPerChunk": ["50", "150", "300"],
  "spec.mapSettings.pollution.minToShowPerChunk": ["0", "50", "100"],
  "spec.mapSettings.enemyEvolution.timeFactor": [
    "0",
    "0.000002",
    "0.000004",
    "0.00001",
    "0.00002",
  ],
  "spec.mapSettings.difficultySettings.technologyPriceMultiplier": [
    "1",
    "2",
    "4",
    "10",
  ],
  "spec.mapSettings.difficultySettings.spoilTimeModifier": [
    "0.5",
    "1",
    "2",
    "4",
  ],
  "spec.mapSettings.maxFailedBehaviorCount": ["0", "1", "3", "5", "10"],
  "spec.resources.cpuRequest": ["250m", "500m", "1", "2"],
  "spec.resources.cpuLimit": ["250m", "500m", "1", "2", "4", "8"],
  "spec.resources.memoryRequest": ["512Mi", "1Gi", "2Gi", "4Gi"],
  "spec.resources.memoryLimit": ["512Mi", "1Gi", "2Gi", "4Gi", "8Gi", "16Gi"],
  "spec.storage.size": ["5Gi", "10Gi", "20Gi", "50Gi", "100Gi"],
};

export const RESOURCES = [
  "coal",
  "stone",
  "copper-ore",
  "iron-ore",
  "uranium-ore",
  "crude-oil",
  "water",
  "trees",
  "enemy-base",
] as const;

export const RESOURCE_FIELDS = ["frequency", "size", "richness"] as const;

export function emptyCredentials(): CredentialsFormValues {
  return {
    gamePassword: "",
    password: "",
    token: "",
    clearGamePassword: false,
    clearPassword: false,
    clearToken: false,
  };
}
