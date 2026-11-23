"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type {
  CredentialsInput,
  FactorioServer,
  FactorioServerSpec,
} from "@factorio/shared";
import { useMemo, useState } from "react";
import {
  FormProvider,
  useForm,
  useWatch,
  type FieldErrors,
} from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { updateServer } from "@/lib/api";
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
  onSaved,
}: {
  server: FactorioServer;
  defaults: FactorioServerSpec;
  effective: FactorioServerSpec;
  schema: SettingsSchema | null;
  versions: string[];
  storageClasses: string[];
  onSaved: (server: FactorioServer, effective: FactorioServerSpec) => void;
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
  const baseline = useMemo(
    () => ({
      spec: withFormDefaults(effective),
      credentials: emptyCredentials(),
    }),
    [effective],
  );

  const [tab, setTab] = useState<string>(SETTINGS_SECTIONS[0].id);
  const [rawEditors, setRawEditors] = useState<RawEditors>(() =>
    rawEditorsFrom(effective),
  );
  const [initialRaw, setInitialRaw] = useState<RawEditors>(() =>
    rawEditorsFrom(effective),
  );
  const [rawError, setRawError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    Object.keys(formState.errors).length > 0;

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
      });
      const merged = mergeWithDefaults(defaults, updated.spec);
      const raw = rawEditorsFrom(merged);

      reset({
        spec: withFormDefaults(merged),
        credentials: emptyCredentials(),
      });
      setRawEditors(raw);
      setInitialRaw(raw);
      onSaved(updated, merged);
      toast.success("Configuration enregistrée");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Impossible d'enregistrer";
      setSaveError(message);
      toast.error(message);
    }
  }

  function handleReset() {
    const raw = rawEditorsFrom(effective);
    reset({ spec: withFormDefaults(effective), credentials: emptyCredentials() });
    setRawEditors(raw);
    setInitialRaw(raw);
    setRawError(null);
    setSaveError(null);
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => void handleSubmit(onSubmit, onInvalid)(event)}
        className="flex flex-col gap-4 pb-24"
      >
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
            <Button type="submit" disabled={!dirty || formState.isSubmitting}>
              {formState.isSubmitting ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={!dirty || formState.isSubmitting}
            >
              Annuler
            </Button>
            {saveError !== null && (
              <span className="text-sm text-destructive">{saveError}</span>
            )}
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
