import {
  ADVANCED_OPTIONS,
  DIFFICULTY_OPTIONS,
  MAP_GEN_SIZE_OPTIONS,
} from "./catalog";
import type { SettingsSection } from "./types";

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
