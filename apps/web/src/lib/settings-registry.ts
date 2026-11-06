import type { FactorioServerSpec } from "@factorio/shared";

import {
  humanizeName,
  MAP_GEN_SIZE_VALUES,
  schemaAt,
  type JsonSchemaNode,
  type SettingsSchema,
  valueAtPath,
} from "./settings-schema";

export type FieldKind =
  | "text"
  | "number"
  | "switch"
  | "select"
  | "textarea"
  | "tags"
  | "quantity"
  | "secret";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldDefinition {
  path: string;
  label: string;
  kind: FieldKind;
  help?: string;
  placeholder?: string;
  step?: string;
  numeric?: boolean;
  emptyAsUndefined?: boolean;
  options?: SelectOption[];
  wide?: boolean;
  clearPath?: string;
  /** Field is fixed once the resource exists (e.g. the data volume). */
  readOnly?: boolean;
  /** Autocomplete values shown in the field's datalist. */
  suggestions?: string[];
  /** OpenAPI schema node resolved from the CRD. */
  schema?: JsonSchemaNode;
  /** Factorio default, used by the "Défaut" option and suggestions. */
  defaultValue?: unknown;
}

export interface FieldGroup {
  title?: string;
  fields: FieldDefinition[];
}

export interface SettingsSection {
  id: string;
  title: string;
  badge?: string;
  description?: string;
  groups: FieldGroup[];
  custom?: "autoplace" | "raw";
}

export interface CatalogOptions {
  versions?: string[];
  storageClasses?: string[];
}

export interface CredentialsFormValues {
  gamePassword: string;
  password: string;
  token: string;
  clearGamePassword: boolean;
  clearPassword: boolean;
  clearToken: boolean;
}

export interface FormValues {
  spec: FactorioServerSpec;
  credentials: CredentialsFormValues;
}

const ADVANCED_OPTIONS: SelectOption[] = [
  { value: "", label: "Défaut" },
  { value: "true", label: "Tous les joueurs" },
  { value: "false", label: "Personne" },
  { value: "admins-only", label: "Admins uniquement" },
];

const DIFFICULTY_OPTIONS: SelectOption[] = [
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
const SUGGESTIONS: Record<string, string[]> = {
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

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "general",
    title: "Général",
    badge: "Redémarre le serveur",
    groups: [
      {
        fields: [
          {
            path: "spec.version",
            label: "Version Factorio",
            kind: "text",
            placeholder: "2.1.24",
            help: "Changer de version redémarre le serveur.",
            emptyAsUndefined: true,
          },
          {
            path: "spec.server.identity.name",
            label: "Nom affiché",
            kind: "text",
            placeholder: "Mon serveur",
            emptyAsUndefined: true,
          },
          {
            path: "spec.server.identity.description",
            label: "Description",
            kind: "textarea",
            wide: true,
          },
          {
            path: "spec.server.identity.tags",
            label: "Tags",
            kind: "tags",
            help: "Séparés par des virgules.",
            wide: true,
          },
        ],
      },
    ],
  },
  {
    id: "access",
    title: "Accès",
    badge: "Redémarre le serveur",
    groups: [
      {
        fields: [
          {
            path: "spec.server.access.maxPlayers",
            label: "Joueurs maximum",
            kind: "number",
            help: "0 = illimité.",
          },
          {
            path: "spec.server.access.allowCommands",
            label: "Commandes console",
            kind: "select",
            options: ADVANCED_OPTIONS,
          },
        ],
      },
      {
        title: "Visibilité",
        fields: [
          {
            path: "spec.server.access.visibility.public",
            label: "Lister publiquement",
            kind: "switch",
            help: "Nécessite un token factorio.com.",
          },
          {
            path: "spec.server.access.visibility.lan",
            label: "Visible sur le LAN",
            kind: "switch",
          },
          {
            path: "spec.server.access.requireUserVerification",
            label: "Comptes factorio.com vérifiés",
            kind: "switch",
          },
        ],
      },
      {
        title: "Identifiants",
        fields: [
          {
            path: "spec.server.authentication.username",
            label: "Compte factorio.com",
            kind: "text",
            placeholder: "nom de compte",
          },
          {
            path: "credentials.gamePassword",
            clearPath: "credentials.clearGamePassword",
            label: "Mot de passe de partie",
            kind: "secret",
            help: "Stocké dans le Secret <serveur>-credentials.",
          },
          {
            path: "credentials.password",
            clearPath: "credentials.clearPassword",
            label: "Mot de passe factorio.com",
            kind: "secret",
          },
          {
            path: "credentials.token",
            clearPath: "credentials.clearToken",
            label: "Token factorio.com",
            kind: "secret",
          },
        ],
      },
    ],
  },
  {
    id: "autosave",
    title: "Sauvegarde automatique",
    badge: "Redémarre le serveur",
    groups: [
      {
        fields: [
          {
            path: "spec.server.autoSave.interval",
            label: "Intervalle (minutes)",
            kind: "number",
            help: "0 désactive l'autosave.",
          },
          {
            path: "spec.server.autoSave.slots",
            label: "Nombre de slots",
            kind: "number",
            help: "Défaut : 5. Fichiers conservés en rotation.",
          },
          {
            path: "spec.server.autoSave.nonBlockingSaving",
            label: "Sauvegarde non bloquante",
            kind: "switch",
            help: "Expérimental.",
          },
          {
            path: "spec.server.autoSave.onlyOnServer",
            label: "Sauvegardes uniquement sur le serveur",
            kind: "switch",
          },
        ],
      },
    ],
  },
  {
    id: "players",
    title: "Joueurs",
    badge: "Redémarre le serveur",
    groups: [
      {
        fields: [
          {
            path: "spec.server.playerManagement.afkAutokickInterval",
            label: "Kick AFK après (minutes)",
            kind: "number",
            help: "0 = jamais.",
          },
          {
            path: "spec.server.playerManagement.maxUploadSlots",
            label: "Slots d'upload max",
            kind: "number",
            help: "0 = illimité.",
          },
          {
            path: "spec.server.playerManagement.maxUploadKilobytesPerSecond",
            label: "Upload max (Ko/s)",
            kind: "number",
            help: "0 = illimité.",
          },
          {
            path: "spec.server.playerManagement.minimumLatencyInTicks",
            label: "Latence minimale (ticks)",
            kind: "number",
            help: "0 = aucune latence ajoutée.",
          },
          {
            path: "spec.server.playerManagement.maxHeartbeatsPerSecond",
            label: "Heartbeats max par seconde",
            kind: "number",
            help: "Défaut : 60.",
          },
          {
            path: "spec.server.playerManagement.autoPauseWhenNoPlayers",
            label: "Pause quand aucun joueur",
            kind: "switch",
          },
          {
            path: "spec.server.playerManagement.onlyAdminsCanPause",
            label: "Seuls les admins peuvent pauser",
            kind: "switch",
          },
          {
            path: "spec.server.playerManagement.ignorePlayerLimitForReturningPlayers",
            label: "Ignorer la limite pour les joueurs habitués",
            kind: "switch",
          },
        ],
      },
    ],
  },
  {
    id: "mapgen",
    title: "Génération de map",
    badge: "Prochaine map",
    description:
      "Ces réglages ne s'appliquent qu'à une nouvelle map. Ils n'ont aucun effet sur la save existante.",
    groups: [
      {
        fields: [
          {
            path: "spec.mapGenSettings.terrainSegmentation",
            label: "Terrain",
            kind: "select",
            numeric: true,
            options: MAP_GEN_SIZE_OPTIONS,
            help: "Échelle du générateur Factorio.",
          },
          {
            path: "spec.mapGenSettings.water",
            label: "Eau",
            kind: "select",
            numeric: true,
            options: MAP_GEN_SIZE_OPTIONS,
            help: "Échelle du générateur Factorio.",
          },
          {
            path: "spec.mapGenSettings.startingArea",
            label: "Zone de départ",
            kind: "select",
            numeric: true,
            options: MAP_GEN_SIZE_OPTIONS,
            help: "Échelle du générateur Factorio.",
          },
          {
            path: "spec.mapGenSettings.width",
            label: "Largeur",
            kind: "number",
            placeholder: "0",
            help: "0 = infinie.",
          },
          {
            path: "spec.mapGenSettings.height",
            label: "Hauteur",
            kind: "number",
            placeholder: "0",
            help: "0 = infinie.",
          },
          {
            path: "spec.mapGenSettings.seed",
            label: "Seed",
            kind: "number",
            placeholder: "aléatoire",
            help: "Laisser vide pour un seed aléatoire.",
          },
          {
            path: "spec.mapGenSettings.peacefulMode",
            label: "Mode pacifique",
            kind: "switch",
          },
        ],
      },
      {
        title: "Falaises",
        fields: [
          {
            path: "spec.mapGenSettings.cliffSettings.name",
            label: "Prototype de falaise",
            kind: "text",
            placeholder: "cliff",
            help: "Nom du prototype Factorio.",
            emptyAsUndefined: true,
          },
          {
            path: "spec.mapGenSettings.cliffSettings.cliffElevation0",
            label: "Élévation de base",
            kind: "number",
            step: "0.1",
          },
          {
            path: "spec.mapGenSettings.cliffSettings.cliffElevationInterval",
            label: "Intervalle d'élévation",
            kind: "number",
            step: "0.1",
          },
          {
            path: "spec.mapGenSettings.cliffSettings.richness",
            label: "Richesse",
            kind: "number",
            step: "0.1",
            help: "0 = pas de falaises, 10 = rangées pleines.",
          },
        ],
      },
    ],
    custom: "autoplace",
  },
  {
    id: "mapsettings",
    title: "Réglages de map",
    badge: "Prochaine map",
    description:
      "Ces réglages sont appliqués à la génération de la map. Les modifier ne change pas la map existante.",
    groups: [
      {
        title: "Pollution",
        fields: [
          {
            path: "spec.mapSettings.pollution.enabled",
            label: "Pollution activée",
            kind: "switch",
          },
          {
            path: "spec.mapSettings.pollution.diffusionRatio",
            label: "Ratio de diffusion",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.pollution.minToDiffuse",
            label: "Minimum pour diffuser",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.pollution.ageing",
            label: "Vieillissement",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.pollution.expectedMaxPerChunk",
            label: "Max attendu par chunk",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.pollution.minToShowPerChunk",
            label: "Minimum affiché par chunk",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.pollution.minPollutionToDamageTrees",
            label: "Pollution pour abîmer les arbres",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.pollution.pollutionWithMaxForestDamage",
            label: "Pollution pour dégâts max",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.pollution.pollutionPerTreeDamage",
            label: "Pollution par dégât d'arbre",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.pollution.pollutionRestoredPerTreeDamage",
            label: "Pollution restaurée par dégât",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.pollution.maxPollutionToRestoreTrees",
            label: "Max restauré par les arbres",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.pollution.enemyAttackPollutionConsumptionModifier",
            label: "Conso de pollution par attaque",
            kind: "number",
            step: "any",
          },
        ],
      },
      {
        title: "Évolution des ennemis",
        fields: [
          {
            path: "spec.mapSettings.enemyEvolution.enabled",
            label: "Évolution activée",
            kind: "switch",
          },
          {
            path: "spec.mapSettings.enemyEvolution.timeFactor",
            label: "Facteur temps",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.enemyEvolution.destroyFactor",
            label: "Facteur destruction",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.enemyEvolution.pollutionFactor",
            label: "Facteur pollution",
            kind: "number",
            step: "any",
          },
        ],
      },
      {
        title: "Expansion des ennemis",
        fields: [
          {
            path: "spec.mapSettings.enemyExpansion.enabled",
            label: "Expansion activée",
            kind: "switch",
          },
          {
            path: "spec.mapSettings.enemyExpansion.maxExpansionDistance",
            label: "Distance d'expansion max",
            kind: "number",
          },
          {
            path: "spec.mapSettings.enemyExpansion.friendlyBaseInfluenceRadius",
            label: "Rayon des bases amies",
            kind: "number",
          },
          {
            path: "spec.mapSettings.enemyExpansion.enemyBuildingInfluenceRadius",
            label: "Rayon des bâtiments ennemis",
            kind: "number",
          },
          {
            path: "spec.mapSettings.enemyExpansion.buildingCoefficient",
            label: "Coefficient bâtiment",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.enemyExpansion.otherBaseCoefficient",
            label: "Coefficient autre base",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.enemyExpansion.neighbouringChunkCoefficient",
            label: "Coefficient chunk voisin",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.enemyExpansion.neighbouringBaseChunkCoefficient",
            label: "Coefficient base voisine",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.enemyExpansion.maxCollidingTilesCoefficient",
            label: "Coefficient collisions",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.enemyExpansion.settlerGroupMinSize",
            label: "Groupe de colons min",
            kind: "number",
          },
          {
            path: "spec.mapSettings.enemyExpansion.settlerGroupMaxSize",
            label: "Groupe de colons max",
            kind: "number",
          },
          {
            path: "spec.mapSettings.enemyExpansion.minExpansionCooldown",
            label: "Cooldown min (ticks)",
            kind: "number",
          },
          {
            path: "spec.mapSettings.enemyExpansion.maxExpansionCooldown",
            label: "Cooldown max (ticks)",
            kind: "number",
          },
        ],
      },
      {
        title: "Difficulté",
        fields: [
          {
            path: "spec.mapSettings.difficultySettings.recipeDifficulty",
            label: "Recettes",
            kind: "select",
            numeric: true,
            options: DIFFICULTY_OPTIONS,
          },
          {
            path: "spec.mapSettings.difficultySettings.technologyDifficulty",
            label: "Technologies",
            kind: "select",
            numeric: true,
            options: DIFFICULTY_OPTIONS,
          },
          {
            path: "spec.mapSettings.difficultySettings.technologyPriceMultiplier",
            label: "Multiplicateur de prix",
            kind: "number",
            step: "any",
          },
          {
            path: "spec.mapSettings.difficultySettings.spoilTimeModifier",
            label: "Modificateur de péremption",
            kind: "number",
            step: "any",
          },
        ],
      },
      {
        fields: [
          {
            path: "spec.mapSettings.maxFailedBehaviorCount",
            label: "Échecs de comportement max",
            kind: "number",
            help: "Défaut : 3.",
          },
        ],
      },
    ],
  },
  {
    id: "infra",
    title: "Ressources, stockage & réseau",
    badge: "Redémarre le serveur",
    description:
      "Limites CPU/RAM du conteneur Factorio, volume de données et exposition du port de jeu. Le stockage est fixé à la création du serveur.",
    groups: [
      {
        fields: [
          {
            path: "spec.resources.cpuRequest",
            label: "CPU — request",
            kind: "quantity",
            placeholder: "500m",
            help: "Défaut : 500m. Réservé au serveur.",
            emptyAsUndefined: true,
          },
          {
            path: "spec.resources.cpuLimit",
            label: "CPU — limit",
            kind: "quantity",
            placeholder: "2",
            help: "Défaut : 2 cœurs. Doit être ≥ CPU — request.",
            emptyAsUndefined: true,
          },
          {
            path: "spec.resources.memoryRequest",
            label: "Mémoire — request",
            kind: "quantity",
            placeholder: "1Gi",
            help: "Défaut : 1Gi.",
            emptyAsUndefined: true,
          },
          {
            path: "spec.resources.memoryLimit",
            label: "Mémoire — limit",
            kind: "quantity",
            placeholder: "4Gi",
            help: "Défaut : 4Gi. Doit être ≥ Mémoire — request. Une grosse usine ou des mods peuvent nécessiter plus.",
            emptyAsUndefined: true,
          },
          {
            path: "spec.storage.size",
            label: "Taille du volume",
            kind: "quantity",
            placeholder: "10Gi",
            help: "Défini à la création. Un PVC existant n'est pas redimensionné.",
            emptyAsUndefined: true,
            readOnly: true,
          },
          {
            path: "spec.storage.storageClassName",
            label: "StorageClass",
            kind: "text",
            placeholder: "défaut du cluster",
            help: "Défini à la création. Non modifiable après.",
            emptyAsUndefined: true,
            readOnly: true,
          },
          {
            path: "spec.service.type",
            label: "Type de Service",
            kind: "select",
            options: [
              { value: "ClusterIP", label: "ClusterIP" },
              { value: "NodePort", label: "NodePort" },
              { value: "LoadBalancer", label: "LoadBalancer" },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "advanced",
    title: "Avancé",
    custom: "raw",
    description:
      "Clés supplémentaires (raw) pour les paramètres non exposés, puis JSON complet réellement rendu. Les clés déjà définies par un champ typé sont refusées dans les éditeurs raw.",
    groups: [],
  },
];

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value !== ""))];
}

function autoKind(node: JsonSchemaNode): FieldKind {
  if (node.enum !== undefined) {
    return "select";
  }
  if (node.type === "boolean") {
    return "switch";
  }
  if (node.type === "integer" || node.type === "number") {
    return "number";
  }
  return "text";
}

function collectLeaves(
  node: JsonSchemaNode,
  prefix: string,
  out: { path: string; key: string; node: JsonSchemaNode }[],
): void {
  if (node.properties === undefined) {
    return;
  }

  for (const [key, child] of Object.entries(node.properties)) {
    if (key === "raw" || /[Rr]ef$/.test(key)) {
      continue;
    }

    const path = `${prefix}.${key}`;
    if (child.properties !== undefined) {
      collectLeaves(child, path, out);
      continue;
    }
    if (child.type === "array" || child.items !== undefined) {
      continue;
    }
    if (child.additionalProperties !== undefined &&
        child.additionalProperties !== false) {
      continue;
    }
    if (child.type === undefined && child.enum === undefined) {
      continue;
    }

    out.push({ path, key, node: child });
  }
}

function buildAutoSection(
  schema: SettingsSchema | null,
  defaults: FactorioServerSpec,
  sections: SettingsSection[],
): SettingsSection | null {
  if (schema === null) {
    return null;
  }

  const known = new Set(
    sections.flatMap((section) =>
      section.groups.flatMap((group) => group.fields.map((field) => field.path)),
    ),
  );
  const leaves: { path: string; key: string; node: JsonSchemaNode }[] = [];
  collectLeaves(schema, "spec", leaves);

  const groups = new Map<string, FieldDefinition[]>();
  for (const leaf of leaves) {
    if (known.has(leaf.path) || leaf.path === "spec.suspended") {
      continue;
    }

    const defaultValue = valueAtPath(defaults, leaf.path);
    const field: FieldDefinition = {
      path: leaf.path,
      label: humanizeName(leaf.key),
      kind: autoKind(leaf.node),
      help: leaf.node.description,
      schema: leaf.node,
      defaultValue,
      suggestions: unique([
        ...(SUGGESTIONS[leaf.path] ?? []),
        ...(defaultValue === undefined ? [] : [String(defaultValue)]),
      ]),
      numeric:
        leaf.node.type === "integer" || leaf.node.type === "number",
    };

    const parent = leaf.path.split(".").slice(0, -1).join(".");
    const group = groups.get(parent) ?? [];
    group.push(field);
    groups.set(parent, group);
  }

  if (groups.size === 0) {
    return null;
  }

  return {
    id: "auto",
    title: "Autres paramètres",
    badge: "Généré depuis le CRD",
    description:
      "Champs présents dans le schéma du CRD mais pas encore dans le catalogue. Ils sont rendus automatiquement.",
    groups: [...groups.entries()].map(([parent, fields]) => ({
      title: humanizeName(parent.split(".").slice(-1)[0] ?? parent),
      fields,
    })),
  };
}

function dynamicFieldOptions(
  field: FieldDefinition,
  catalog: CatalogOptions,
): Partial<
  Pick<FieldDefinition, "kind" | "options" | "suggestions">
> {
  if (field.path === "spec.version") {
    const versions = catalog.versions ?? [];
    if (versions.length > 0) {
      return {
        kind: "select",
        options: [
          { value: "", label: "Défaut" },
          ...versions.map((version) => ({ value: version, label: version })),
        ],
        suggestions: [],
      };
    }
    return { suggestions: [] };
  }

  if (field.path === "spec.storage.storageClassName") {
    const storageClasses = catalog.storageClasses ?? [];
    if (storageClasses.length > 0) {
      return {
        kind: "select",
        options: [
          { value: "", label: "Défaut du cluster" },
          ...storageClasses.map((name) => ({ value: name, label: name })),
        ],
        suggestions: [],
      };
    }
    return { suggestions: [] };
  }

  return {};
}

/**
 * Builds the visible sections from the curated catalog and the CRD schema.
 * Fields keep their curated labels/groups; types, bounds, enums and defaults
 * come from the schema. Unknown schema fields are appended automatically.
 */
export function buildSections(
  schema: SettingsSchema | null,
  defaults: FactorioServerSpec,
  catalog: CatalogOptions = {},
): SettingsSection[] {
  const sections: SettingsSection[] = SETTINGS_SECTIONS.map((section) => ({
    ...section,
    groups: section.groups.map((group) => ({
      ...group,
      fields: group.fields.map((field) => {
        const node = schemaAt(schema, field.path);
        const defaultValue = valueAtPath(defaults, field.path);
        const dynamic = dynamicFieldOptions(field, catalog);
        return {
          ...field,
          ...dynamic,
          schema: node,
          defaultValue,
          suggestions:
            dynamic.suggestions ??
            unique([
              ...(SUGGESTIONS[field.path] ?? []),
              ...(defaultValue === undefined ? [] : [String(defaultValue)]),
              ...(node?.enum === undefined ? [] : node.enum.map(String)),
            ]),
        };
      }),
    })),
  }));

  const auto = buildAutoSection(schema, defaults, sections);
  if (auto !== null) {
    sections.push(auto);
  }
  return sections;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arraysEqual(left: unknown[], right: unknown): boolean {
  if (!Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every(
    (value, index) => JSON.stringify(value) === JSON.stringify(right[index]),
  );
}

/**
 * Returns only the values that differ from the defaults. The custom resource
 * stays sparse: a value equal to the Factorio default is omitted so the
 * renderer keeps applying its own default.
 */
export function diffAgainstDefaults(
  current: unknown,
  defaults: unknown,
): unknown {
  if (current === undefined) {
    return undefined;
  }

  if (Array.isArray(current)) {
    return arraysEqual(current, defaults) ? undefined : current;
  }

  if (isRecord(current)) {
    const base = isRecord(defaults) ? defaults : {};
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(current)) {
      const diff = diffAgainstDefaults(value, base[key]);
      if (diff !== undefined) {
        result[key] = diff;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  if (typeof current === "number" && typeof defaults === "number") {
    return Math.abs(current - defaults) < 1e-12 ? undefined : current;
  }

  return current === defaults ? undefined : current;
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (!isRecord(target) || !isRecord(source)) {
    return source;
  }

  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    result[key] = deepMerge(result[key], value);
  }
  return result;
}

export function mergeWithDefaults(
  defaults: FactorioServerSpec,
  overrides: FactorioServerSpec,
): FactorioServerSpec {
  return deepMerge(
    structuredClone(defaults),
    overrides,
  ) as FactorioServerSpec;
}
