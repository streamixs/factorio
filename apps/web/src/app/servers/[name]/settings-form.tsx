"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type {
  CredentialsInput,
  EffectiveSettings,
  FactorioServer,
  FactorioServerSpec,
} from "@factorio/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FormProvider,
  useForm,
  useWatch,
  type FieldErrors,
} from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ApiError, updateServer } from "@/lib/api";
import {
  SETTINGS_SECTIONS,
  buildSections,
  diffAgainstDefaults,
  emptyCredentials,
  mergeWithDefaults,
  type FormValues,
} from "@/lib/settings-registry";
import type { SettingsSchema } from "@/lib/settings-schema";

import {
  rawEditorsFrom,
  parseRawEditor,
  withFormDefaults,
  type RawEditors,
} from "./settings-form/helpers";
import { SectionCard } from "./settings-form/section-card";
import { compareVersions, formSchema } from "./settings-form/validation";

export function SettingsForm({
  server,
  defaults,
  effective,
  schema,
  versions,
  storageClasses,
  operationActive,
  onSaved,
  onReload,
}: {
  server: FactorioServer;
  defaults: FactorioServerSpec;
  effective: FactorioServerSpec;
  schema: SettingsSchema | null;
  versions: string[];
  storageClasses: string[];
  operationActive: boolean;
  onSaved: (server: FactorioServer, effective: FactorioServerSpec) => void;
  onReload: () => Promise<{
    server: FactorioServer;
    settings: EffectiveSettings;
  } | null>;
}) {
  const allowedVersions = useMemo(() => {
    const current = effective.version ?? "0.0.0";
    return versions.filter(
      (version) => compareVersions(version, current) >= 0,
    );
  }, [versions, effective.version]);
  const sections = useMemo(
    () =>
      buildSections(schema, defaults, {
        versions: allowedVersions,
        storageClasses,
      }),
    [schema, defaults, allowedVersions, storageClasses],
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      spec: withFormDefaults(effective),
      credentials: emptyCredentials(),
    },
    mode: "onBlur",
    reValidateMode: "onChange",
  });
  const { handleSubmit, reset, formState } = form;
  const watched = useWatch({ control: form.control });

  const [tab, setTab] = useState<string>(SETTINGS_SECTIONS[0].id);
  const [baseline, setBaseline] = useState(() => ({
    spec: withFormDefaults(effective),
    credentials: emptyCredentials(),
  }));
  const [rawEditors, setRawEditors] = useState<RawEditors>(() =>
    rawEditorsFrom(effective),
  );
  const [initialRaw, setInitialRaw] = useState<RawEditors>(() =>
    rawEditorsFrom(effective),
  );
  const [rawError, setRawError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [externalChange, setExternalChange] = useState(false);
  const [reloading, setReloading] = useState(false);

  const generationRef = useRef(server.metadata.generation);
  const effectiveKeyRef = useRef(JSON.stringify(effective));
  const dirtyRef = useRef(false);

  const rawDirty =
    rawEditors.server !== initialRaw.server ||
    rawEditors.mapGen !== initialRaw.mapGen ||
    rawEditors.mapSettings !== initialRaw.mapSettings;
  const valuesDirty = JSON.stringify(watched) !== JSON.stringify(baseline);
  const dirty = valuesDirty || rawDirty;
  const showActions =
    dirty ||
    formState.isSubmitting ||
    saveError !== null ||
    externalChange ||
    Object.keys(formState.errors).length > 0;

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const applyBaseline = useCallback(
    (spec: FactorioServerSpec, generation: number | undefined) => {
      const next = withFormDefaults(spec);
      const raw = rawEditorsFrom(spec);

      reset({ spec: next, credentials: emptyCredentials() });
      setBaseline({ spec: next, credentials: emptyCredentials() });
      setRawEditors(raw);
      setInitialRaw(raw);
      generationRef.current = generation;
      effectiveKeyRef.current = JSON.stringify(spec);
      setExternalChange(false);
      setRawError(null);
      setSaveError(null);
    },
    [reset],
  );

  useEffect(() => {
    const nextGeneration = server.metadata.generation;
    const nextKey = JSON.stringify(effective);
    const generationChanged = nextGeneration !== generationRef.current;
    const effectiveChanged = nextKey !== effectiveKeyRef.current;

    if (!generationChanged && !effectiveChanged) {
      return;
    }

    if (dirtyRef.current) {
      setExternalChange(true);
      return;
    }

    // Wait until the agent publishes the effective values matching the new
    // generation. Adopting the generation too early would let a stale form
    // pass the conflict check.
    if (!effectiveChanged) {
      return;
    }

    applyBaseline(effective, nextGeneration);
  }, [applyBaseline, effective, server.metadata.generation]);

  const secretIsSet: Record<string, boolean> = {
    "credentials.gamePassword":
      server.spec.server?.access?.gamePasswordRef !== undefined,
    "credentials.password":
      server.spec.server?.authentication?.passwordRef !== undefined,
    "credentials.token":
      server.spec.server?.authentication?.tokenRef !== undefined,
  };

  function onInvalid(errors: FieldErrors<FormValues>) {
    if (errors.spec?.resources !== undefined) {
      setTab("infra");
    }
  }

  async function onSubmit(values: FormValues) {
    setSaveError(null);

    if (operationActive) {
      setSaveError(
        "Une opération est en cours. Attends qu'elle se termine avant d'enregistrer.",
      );
      return;
    }

    let serverRaw: Record<string, unknown> | undefined;
    let mapGenRaw: Record<string, unknown> | undefined;
    let mapSettingsRaw: Record<string, unknown> | undefined;

    try {
      serverRaw = parseRawEditor(rawEditors.server, "server-settings.json (raw)");
      mapGenRaw = parseRawEditor(rawEditors.mapGen, "map-gen-settings.json (raw)");
      mapSettingsRaw = parseRawEditor(rawEditors.mapSettings, "map-settings.json (raw)");
    } catch (error) {
      setRawError(error instanceof Error ? error.message : "JSON invalide");
      setTab("advanced");
      return;
    }
    setRawError(null);

    const spec = structuredClone(values.spec);
    // The API preserves the live suspension state; the settings form must not
    // send a stale value loaded before an external start/stop.
    delete spec.suspended;

    if (spec.mapGenSettings?.startingPoints?.length === 0) {
      delete spec.mapGenSettings.startingPoints;
    }

    if (serverRaw !== undefined) {
      spec.server = { ...(spec.server ?? {}), raw: serverRaw };
    } else if (spec.server !== undefined) {
      delete spec.server.raw;
    }

    if (mapGenRaw !== undefined) {
      spec.mapGenSettings = { ...(spec.mapGenSettings ?? {}), raw: mapGenRaw };
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

    const sparse = (diffAgainstDefaults(spec, defaults) ??
      {}) as FactorioServerSpec;

    try {
      const updated = await updateServer(server.metadata.name, {
        spec: sparse,
        credentials:
          Object.keys(credentials).length > 0 ? credentials : undefined,
        generation: generationRef.current,
      });
      const merged = mergeWithDefaults(defaults, updated.spec);

      applyBaseline(merged, updated.metadata.generation);
      onSaved(updated, merged);
      toast.success("Configuration enregistrée");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setExternalChange(true);
        const message =
          "Conflit : la configuration a changé. Recharge les valeurs à jour.";
        setSaveError(message);
        toast.error(message);
        return;
      }

      const message =
        error instanceof Error ? error.message : "Impossible d'enregistrer";
      setSaveError(message);
      toast.error(message);
    }
  }

  function handleReset() {
    const effectiveChanged =
      JSON.stringify(effective) !== effectiveKeyRef.current;

    // If the agent has not published new effective values yet, keep the
    // generation that matches the displayed values so a later save still
    // detects the external spec change.
    applyBaseline(
      effective,
      effectiveChanged ? server.metadata.generation : generationRef.current,
    );
  }

  async function handleReload() {
    if (
      dirty &&
      !window.confirm(
        "Recharger la configuration et perdre tes modifications ?",
      )
    ) {
      return;
    }

    setReloading(true);
    try {
      const result = await onReload();
      if (result === null) {
        toast.error("Impossible de recharger la configuration");
        return;
      }

      applyBaseline(
        result.settings.effective,
        result.server.metadata.generation,
      );
      toast.success("Configuration rechargée");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de recharger la configuration",
      );
    } finally {
      setReloading(false);
    }
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => void handleSubmit(onSubmit, onInvalid)(event)}
        className="flex flex-col gap-4 pb-24"
      >
        {externalChange && (
          <Alert>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>
                La configuration a été modifiée ailleurs. Tes modifications
                n&apos;ont pas été enregistrées.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleReload()}
                disabled={reloading || formState.isSubmitting}
              >
                {reloading ? "Rechargement…" : "Recharger les valeurs à jour"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(String(value))}
          className="flex-col"
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            {sections.map((section) => (
              <TabsTrigger key={section.id} value={section.id}>
                {section.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {sections.map((section) => (
            <TabsContent
              key={section.id}
              value={section.id}
              keepMounted
              className="mt-4"
            >
              <SectionCard
                section={section}
                serverName={server.metadata.name}
                secretIsSet={secretIsSet}
                rawEditors={rawEditors}
                setRawEditors={setRawEditors}
                rawError={rawError}
              />
            </TabsContent>
          ))}
        </Tabs>

        {showActions && (
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
            <Button
              type="submit"
              disabled={!dirty || formState.isSubmitting || operationActive}
            >
              {formState.isSubmitting ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={!dirty || formState.isSubmitting || operationActive}
            >
              Annuler
            </Button>
            {operationActive && (
              <span className="text-sm text-muted-foreground">
                Opération en cours : enregistrement désactivé.
              </span>
            )}
            {saveError !== null ? (
              <span className="text-sm text-destructive">{saveError}</span>
            ) : externalChange ? (
              <span className="text-sm text-destructive">
                Configuration modifiée ailleurs : recharge les valeurs à jour.
              </span>
            ) : null}
            {!formState.isSubmitting &&
              Object.keys(formState.errors).length > 0 && (
                <span className="text-sm text-destructive">
                  Certains champs sont invalides.
                </span>
              )}
          </div>
        )}
      </form>
    </FormProvider>
  );
}
