"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  factorioServerSpecSchema,
  type CredentialsInput,
  type FactorioServer,
  type FactorioServerSpec,
} from "@factorio/shared";
import { useState, type ReactNode } from "react";
import {
  FormProvider,
  useForm,
  type FieldPath,
} from "react-hook-form";
import { z } from "zod";

import { updateServer } from "@/lib/api";

import {
  CheckboxField,
  JsonEditor,
  NumberField,
  SecretField,
  SelectField,
  TagsField,
  TextAreaField,
  TextField,
  inputClass,
  toOptionalNumber,
} from "./fields";

export interface FormValues {
  spec: FactorioServerSpec;
  credentials: {
    gamePassword: string;
    password: string;
    token: string;
    clearGamePassword: boolean;
    clearPassword: boolean;
    clearToken: boolean;
  };
}

const formSchema = z.object({
  spec: factorioServerSpecSchema,
  credentials: z.strictObject({
    gamePassword: z.string(),
    password: z.string(),
    token: z.string(),
    clearGamePassword: z.boolean(),
    clearPassword: z.boolean(),
    clearToken: z.boolean(),
  }),
});

const TABS = [
  { id: "general", label: "Général" },
  { id: "access", label: "Accès" },
  { id: "autosave", label: "Sauvegarde" },
  { id: "players", label: "Joueurs" },
  { id: "mapgen", label: "Génération de map" },
  { id: "mapsettings", label: "Réglages de map" },
  { id: "infra", label: "Stockage & réseau" },
  { id: "advanced", label: "Avancé" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const RESOURCES = [
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

const RESOURCE_FIELDS = ["frequency", "size", "richness"] as const;

type RawEditors = {
  server: string;
  mapGen: string;
  mapSettings: string;
};

function rawText(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value, null, 2);
}

function fromServerRaw(server: FactorioServer): RawEditors {
  return {
    server: rawText(server.spec.server?.raw),
    mapGen: rawText(server.spec.mapGenSettings?.raw),
    mapSettings: rawText(server.spec.mapSettings?.raw),
  };
}

function parseRawEditor(
  text: string,
  label: string,
): Record<string, unknown> | undefined {
  if (text.trim() === "") {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${label}: JSON invalide (${
        error instanceof Error ? error.message : "erreur"
      })`,
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label}: un objet JSON est attendu`);
  }

  return parsed as Record<string, unknown>;
}

// RHF creates intermediate objects for registered paths, even when every
// field below them is empty. Remove those empty objects before sending the
// spec so they do not override Factorio defaults.
function pruneEmptyObjects(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => pruneEmptyObjects(item))
      .filter((item) => item !== undefined);
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const pruned = pruneEmptyObjects(item);
      if (pruned !== undefined) {
        result[key] = pruned;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  return value;
}

// Fill the effective Factorio defaults for booleans and enums, so a checkbox
// that is unchecked does not silently override a default that is true.
function toFormValues(server: FactorioServer): FormValues {
  const spec = structuredClone(server.spec);

  spec.server ??= {};
  spec.server.access ??= {};
  spec.server.access.visibility ??= {};
  spec.server.access.visibility.public ??= true;
  spec.server.access.visibility.lan ??= true;
  spec.server.access.requireUserVerification ??= true;
  spec.server.access.allowCommands ??= "admins-only";

  spec.server.autoSave ??= {};
  spec.server.autoSave.onlyOnServer ??= true;

  spec.server.playerManagement ??= {};
  spec.server.playerManagement.autoPauseWhenNoPlayers ??= true;
  spec.server.playerManagement.onlyAdminsCanPause ??= true;

  spec.mapGenSettings ??= {};
  spec.mapGenSettings.peacefulMode ??= false;

  spec.mapSettings ??= {};
  spec.mapSettings.pollution ??= {};
  spec.mapSettings.pollution.enabled ??= true;
  spec.mapSettings.enemyEvolution ??= {};
  spec.mapSettings.enemyEvolution.enabled ??= true;
  spec.mapSettings.enemyExpansion ??= {};
  spec.mapSettings.enemyExpansion.enabled ??= true;

  return {
    spec,
    credentials: {
      gamePassword: "",
      password: "",
      token: "",
      clearGamePassword: false,
      clearPassword: false,
      clearToken: false,
    },
  };
}

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        {badge !== undefined && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {badge}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function SubSection({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <summary className="cursor-pointer text-sm font-semibold">
        {title}
      </summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </details>
  );
}

export function SettingsForm({
  server,
  onSaved,
}: {
  server: FactorioServer;
  onSaved: (server: FactorioServer) => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(server),
    mode: "onBlur",
  });
  const { register, handleSubmit, reset, formState } = form;

  const [tab, setTab] = useState<TabId>("general");
  const [rawEditors, setRawEditors] = useState<RawEditors>(() =>
    fromServerRaw(server),
  );
  const [initialRaw, setInitialRaw] = useState<RawEditors>(() =>
    fromServerRaw(server),
  );
  const [rawError, setRawError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const rawDirty =
    rawEditors.server !== initialRaw.server ||
    rawEditors.mapGen !== initialRaw.mapGen ||
    rawEditors.mapSettings !== initialRaw.mapSettings;
  const dirty = formState.isDirty || rawDirty;

  const credentialRefs = {
    gamePassword: server.spec.server?.access?.gamePasswordRef !== undefined,
    password:
      server.spec.server?.authentication?.passwordRef !== undefined,
    token: server.spec.server?.authentication?.tokenRef !== undefined,
  };

  async function onSubmit(values: FormValues) {
    setSaveError(null);
    setSaved(false);

    let serverRaw: Record<string, unknown> | undefined;
    let mapGenRaw: Record<string, unknown> | undefined;
    let mapSettingsRaw: Record<string, unknown> | undefined;

    try {
      serverRaw = parseRawEditor(rawEditors.server, "server.raw");
      mapGenRaw = parseRawEditor(rawEditors.mapGen, "mapGenSettings.raw");
      mapSettingsRaw = parseRawEditor(
        rawEditors.mapSettings,
        "mapSettings.raw",
      );
    } catch (error) {
      setRawError(error instanceof Error ? error.message : "JSON invalide");
      setTab("advanced");
      return;
    }
    setRawError(null);

    const spec = (pruneEmptyObjects(structuredClone(values.spec)) ??
      {}) as FactorioServerSpec;

    if (serverRaw !== undefined) {
      spec.server = { ...(spec.server ?? {}), raw: serverRaw };
    } else if (spec.server !== undefined) {
      delete spec.server.raw;
    }

    if (mapGenRaw !== undefined) {
      spec.mapGenSettings = {
        ...(spec.mapGenSettings ?? {}),
        raw: mapGenRaw,
      };
    } else if (spec.mapGenSettings !== undefined) {
      delete spec.mapGenSettings.raw;
    }

    if (mapSettingsRaw !== undefined) {
      spec.mapSettings = {
        ...(spec.mapSettings ?? {}),
        raw: mapSettingsRaw,
      };
    } else if (spec.mapSettings !== undefined) {
      delete spec.mapSettings.raw;
    }

    const credentials: CredentialsInput = {};

    if (values.credentials.clearGamePassword) {
      credentials.gamePassword = null;
    } else if (values.credentials.gamePassword !== "") {
      credentials.gamePassword = values.credentials.gamePassword;
    }

    if (values.credentials.clearPassword) {
      credentials.password = null;
    } else if (values.credentials.password !== "") {
      credentials.password = values.credentials.password;
    }

    if (values.credentials.clearToken) {
      credentials.token = null;
    } else if (values.credentials.token !== "") {
      credentials.token = values.credentials.token;
    }

    try {
      const updated = await updateServer(server.metadata.name, {
        spec,
        credentials:
          Object.keys(credentials).length > 0 ? credentials : undefined,
      });

      reset(toFormValues(updated));
      const raw = fromServerRaw(updated);
      setRawEditors(raw);
      setInitialRaw(raw);
      setSaved(true);
      onSaved(updated);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Impossible d'enregistrer",
      );
    }
  }

  function handleReset() {
    reset(toFormValues(server));
    const raw = fromServerRaw(server);
    setRawEditors(raw);
    setInitialRaw(raw);
    setRawError(null);
    setSaveError(null);
    setSaved(false);
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={
                tab === item.id
                  ? "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className={tab === "general" ? "flex flex-col gap-4" : "hidden"}>
          <Section title="Général" badge="Redémarre le serveur">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="spec.version"
                label="Version Factorio"
                placeholder="2.1.24"
                hint="Changer de version redémarre le serveur."
                emptyAsUndefined
              />
              <TextField
                name="spec.server.identity.name"
                label="Nom affiché"
                placeholder="Mon serveur"
                emptyAsUndefined
              />
            </div>
            <TextAreaField
              name="spec.server.identity.description"
              label="Description"
            />
            <TagsField name="spec.server.identity.tags" label="Tags" />
          </Section>
        </div>

        <div className={tab === "access" ? "flex flex-col gap-4" : "hidden"}>
          <Section title="Accès" badge="Redémarre le serveur">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                name="spec.server.access.maxPlayers"
                label="Joueurs maximum"
                hint="0 = illimité"
              />
              <SelectField
                name="spec.server.access.allowCommands"
                label="Commandes console"
                options={[
                  { value: "", label: "Défaut" },
                  { value: "true", label: "Tous les joueurs" },
                  { value: "false", label: "Personne" },
                  { value: "admins-only", label: "Admins uniquement" },
                ]}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxField
                name="spec.server.access.visibility.public"
                label="Lister publiquement"
                hint="Nécessite un token factorio.com."
              />
              <CheckboxField
                name="spec.server.access.visibility.lan"
                label="Visible sur le LAN"
              />
              <CheckboxField
                name="spec.server.access.requireUserVerification"
                label="Comptes factorio.com vérifiés"
              />
            </div>
            <SubSection title="Identifiants" open>
              <SecretField
                valueName="credentials.gamePassword"
                clearName="credentials.clearGamePassword"
                label="Mot de passe de partie"
                hint="Stocké dans le Secret <serveur>-credentials."
                isSet={credentialRefs.gamePassword}
              />
              <TextField
                name="spec.server.authentication.username"
                label="Compte factorio.com"
                placeholder="nom de compte"
              />
              <SecretField
                valueName="credentials.password"
                clearName="credentials.clearPassword"
                label="Mot de passe factorio.com"
                isSet={credentialRefs.password}
              />
              <SecretField
                valueName="credentials.token"
                clearName="credentials.clearToken"
                label="Token factorio.com"
                isSet={credentialRefs.token}
              />
            </SubSection>
          </Section>
        </div>

        <div className={tab === "autosave" ? "flex flex-col gap-4" : "hidden"}>
          <Section title="Sauvegarde" badge="Redémarre le serveur">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                name="spec.server.autoSave.interval"
                label="Intervalle (minutes)"
                hint="0 désactive l'autosave"
              />
              <NumberField
                name="spec.server.autoSave.slots"
                label="Nombre de slots"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxField
                name="spec.server.autoSave.nonBlockingSaving"
                label="Sauvegarde non bloquante"
                hint="Expérimental."
              />
              <CheckboxField
                name="spec.server.autoSave.onlyOnServer"
                label="Sauvegardes uniquement sur le serveur"
              />
            </div>
          </Section>
        </div>

        <div className={tab === "players" ? "flex flex-col gap-4" : "hidden"}>
          <Section title="Joueurs" badge="Redémarre le serveur">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                name="spec.server.playerManagement.afkAutokickInterval"
                label="Kick AFK après (minutes)"
                hint="0 = jamais"
              />
              <NumberField
                name="spec.server.playerManagement.maxUploadSlots"
                label="Slots d'upload max"
              />
              <NumberField
                name="spec.server.playerManagement.maxUploadKilobytesPerSecond"
                label="Upload max (Ko/s)"
                hint="0 = illimité"
              />
              <NumberField
                name="spec.server.playerManagement.minimumLatencyInTicks"
                label="Latence minimale (ticks)"
              />
              <NumberField
                name="spec.server.playerManagement.maxHeartbeatsPerSecond"
                label="Heartbeats max par seconde"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxField
                name="spec.server.playerManagement.autoPauseWhenNoPlayers"
                label="Pause quand aucun joueur"
              />
              <CheckboxField
                name="spec.server.playerManagement.onlyAdminsCanPause"
                label="Seuls les admins peuvent pauser"
              />
              <CheckboxField
                name="spec.server.playerManagement.ignorePlayerLimitForReturningPlayers"
                label="Ignorer la limite pour les joueurs habitués"
              />
            </div>
          </Section>
        </div>

        <div className={tab === "mapgen" ? "flex flex-col gap-4" : "hidden"}>
          <Section title="Génération de map" badge="Prochaine map">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Ces réglages ne s&apos;appliquent qu&apos;à une nouvelle map. Ils
              n&apos;ont aucun effet sur la save existante.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                name="spec.mapGenSettings.terrainSegmentation"
                label="Terrain"
                step="0.1"
                placeholder="1"
              />
              <NumberField
                name="spec.mapGenSettings.water"
                label="Eau"
                step="0.1"
                placeholder="1"
              />
              <NumberField
                name="spec.mapGenSettings.startingArea"
                label="Zone de départ"
                step="0.1"
                placeholder="1"
              />
              <NumberField
                name="spec.mapGenSettings.width"
                label="Largeur"
                placeholder="0"
                hint="0 = infinie"
              />
              <NumberField
                name="spec.mapGenSettings.height"
                label="Hauteur"
                placeholder="0"
              />
              <NumberField
                name="spec.mapGenSettings.seed"
                label="Seed"
                placeholder="aléatoire"
              />
            </div>
            <CheckboxField
              name="spec.mapGenSettings.peacefulMode"
              label="Mode pacifique"
            />
            <SubSection title="Ressources (autoplace)">
              <div className="overflow-x-auto sm:col-span-2">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500 dark:text-zinc-400">
                      <th className="pb-2 pr-3 font-medium">Ressource</th>
                      <th className="pb-2 px-1 font-medium">Fréquence</th>
                      <th className="pb-2 px-1 font-medium">Taille</th>
                      <th className="pb-2 px-1 font-medium">Richesse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RESOURCES.map((resource) => (
                      <tr key={resource}>
                        <td className="py-1 pr-3 font-mono text-xs">
                          {resource}
                        </td>
                        {RESOURCE_FIELDS.map((field) => (
                          <td key={field} className="p-1">
                            <input
                              type="number"
                              step="0.1"
                              className={inputClass}
                              {...register(
                                `spec.mapGenSettings.autoplaceControls.${resource}.${field}` as FieldPath<FormValues>,
                                { setValueAs: toOptionalNumber },
                              )}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SubSection>
            <SubSection title="Falaises">
              <TextField
                name="spec.mapGenSettings.cliffSettings.name"
                label="Nom"
                placeholder="cliff"
                emptyAsUndefined
              />
              <NumberField
                name="spec.mapGenSettings.cliffSettings.cliffElevation0"
                label="Élévation de base"
                step="0.1"
              />
              <NumberField
                name="spec.mapGenSettings.cliffSettings.cliffElevationInterval"
                label="Intervalle d'élévation"
                step="0.1"
              />
              <NumberField
                name="spec.mapGenSettings.cliffSettings.richness"
                label="Richesse"
                step="0.1"
              />
            </SubSection>
          </Section>
        </div>

        <div
          className={tab === "mapsettings" ? "flex flex-col gap-4" : "hidden"}
        >
          <Section title="Réglages de map" badge="Prochaine map">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Ces réglages sont appliqués à la génération de la map. Les
              modifier ne change pas la map existante.
            </p>

            <SubSection title="Pollution" open>
              <CheckboxField
                name="spec.mapSettings.pollution.enabled"
                label="Pollution activée"
              />
              <NumberField
                name="spec.mapSettings.pollution.diffusionRatio"
                label="Ratio de diffusion"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.pollution.minToDiffuse"
                label="Minimum pour diffuser"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.pollution.ageing"
                label="Vieillissement"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.pollution.expectedMaxPerChunk"
                label="Max attendu par chunk"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.pollution.minToShowPerChunk"
                label="Minimum affiché par chunk"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.pollution.minPollutionToDamageTrees"
                label="Pollution pour abîmer les arbres"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.pollution.pollutionWithMaxForestDamage"
                label="Pollution pour dégâts max"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.pollution.pollutionPerTreeDamage"
                label="Pollution par dégât d'arbre"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.pollution.pollutionRestoredPerTreeDamage"
                label="Pollution restaurée par dégât"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.pollution.maxPollutionToRestoreTrees"
                label="Max restauré par les arbres"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.pollution.enemyAttackPollutionConsumptionModifier"
                label="Conso de pollution par attaque"
                step="any"
              />
            </SubSection>

            <SubSection title="Évolution des ennemis">
              <CheckboxField
                name="spec.mapSettings.enemyEvolution.enabled"
                label="Évolution activée"
              />
              <NumberField
                name="spec.mapSettings.enemyEvolution.timeFactor"
                label="Facteur temps"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.enemyEvolution.destroyFactor"
                label="Facteur destruction"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.enemyEvolution.pollutionFactor"
                label="Facteur pollution"
                step="any"
              />
            </SubSection>

            <SubSection title="Expansion des ennemis">
              <CheckboxField
                name="spec.mapSettings.enemyExpansion.enabled"
                label="Expansion activée"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.maxExpansionDistance"
                label="Distance d'expansion max"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.friendlyBaseInfluenceRadius"
                label="Rayon des bases amies"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.enemyBuildingInfluenceRadius"
                label="Rayon des bâtiments ennemis"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.buildingCoefficient"
                label="Coefficient bâtiment"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.otherBaseCoefficient"
                label="Coefficient autre base"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.neighbouringChunkCoefficient"
                label="Coefficient chunk voisin"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.neighbouringBaseChunkCoefficient"
                label="Coefficient base voisine"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.maxCollidingTilesCoefficient"
                label="Coefficient collisions"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.settlerGroupMinSize"
                label="Groupe de colons min"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.settlerGroupMaxSize"
                label="Groupe de colons max"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.minExpansionCooldown"
                label="Cooldown min (ticks)"
              />
              <NumberField
                name="spec.mapSettings.enemyExpansion.maxExpansionCooldown"
                label="Cooldown max (ticks)"
              />
            </SubSection>

            <SubSection title="Difficulté">
              <SelectField
                name="spec.mapSettings.difficultySettings.recipeDifficulty"
                label="Recettes"
                numeric
                options={[
                  { value: "", label: "Défaut" },
                  { value: "0", label: "Normal" },
                  { value: "1", label: "Coûteux" },
                ]}
              />
              <SelectField
                name="spec.mapSettings.difficultySettings.technologyDifficulty"
                label="Technologies"
                numeric
                options={[
                  { value: "", label: "Défaut" },
                  { value: "0", label: "Normal" },
                  { value: "1", label: "Coûteux" },
                ]}
              />
              <NumberField
                name="spec.mapSettings.difficultySettings.technologyPriceMultiplier"
                label="Multiplicateur de prix"
                step="any"
              />
              <NumberField
                name="spec.mapSettings.difficultySettings.spoilTimeModifier"
                label="Modificateur de péremption"
                step="any"
              />
            </SubSection>

            <NumberField
              name="spec.mapSettings.maxFailedBehaviorCount"
              label="Échecs de comportement max"
            />
          </Section>
        </div>

        <div className={tab === "infra" ? "flex flex-col gap-4" : "hidden"}>
          <Section title="Stockage & réseau" badge="Service immédiat">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="spec.storage.size"
                label="Taille du volume"
                placeholder="10Gi"
                hint="Un PVC existant n'est pas redimensionné."
                emptyAsUndefined
              />
              <TextField
                name="spec.storage.storageClassName"
                label="StorageClass"
                placeholder="défaut du cluster"
                emptyAsUndefined
              />
              <SelectField
                name="spec.service.type"
                label="Type de Service"
                options={[
                  { value: "ClusterIP", label: "ClusterIP" },
                  { value: "NodePort", label: "NodePort" },
                  { value: "LoadBalancer", label: "LoadBalancer" },
                ]}
              />
            </div>
          </Section>
        </div>

        <div
          className={tab === "advanced" ? "flex flex-col gap-4" : "hidden"}
        >
          <Section title="JSON avancé" badge="Échappatoire">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Pour les paramètres qui ne sont pas exposés dans les onglets. Les
              clés déjà définies par un champ typé sont refusées.
            </p>
            {rawError !== null && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {rawError}
              </p>
            )}
            <JsonEditor
              label="server.raw"
              value={rawEditors.server}
              onChange={(value) =>
                setRawEditors((current) => ({ ...current, server: value }))
              }
              hint="Ex. : minimum_segment_size, auto_pause_when_players_connect."
            />
            <JsonEditor
              label="mapGenSettings.raw"
              value={rawEditors.mapGen}
              onChange={(value) =>
                setRawEditors((current) => ({ ...current, mapGen: value }))
              }
              hint="Ex. : property_expression_names, autoplace d'autres entités."
            />
            <JsonEditor
              label="mapSettings.raw"
              value={rawEditors.mapSettings}
              onChange={(value) =>
                setRawEditors((current) => ({
                  ...current,
                  mapSettings: value,
                }))
              }
              hint="Ex. : unit_group, path_finder, asteroids."
            />
          </Section>
        </div>

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <button
            type="submit"
            disabled={!dirty || formState.isSubmitting}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {formState.isSubmitting ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={!dirty || formState.isSubmitting}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Annuler
          </button>
          {saved && !dirty && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              Enregistré
            </span>
          )}
          {saveError !== null && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {saveError}
            </span>
          )}
          {!formState.isSubmitting && Object.keys(formState.errors).length > 0 && (
            <span className="text-sm text-red-600 dark:text-red-400">
              Certains champs sont invalides.
            </span>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
