"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  factorioServerSpecSchema,
  type CredentialsInput,
  type FactorioServer,
  type FactorioServerSpec,
} from "@factorio/shared";
import { useState } from "react";
import {
  Controller,
  FormProvider,
  useForm,
  useFormContext,
  type FieldPath,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { updateServer } from "@/lib/api";
import {
  RESOURCES,
  RESOURCE_FIELDS,
  SETTINGS_SECTIONS,
  diffAgainstDefaults,
  emptyCredentials,
  mergeWithDefaults,
  type FieldDefinition,
  type FormValues,
  type SettingsSection,
} from "@/lib/settings-registry";

const DEFAULT_SELECT_VALUE = "__default__";

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

type RawEditors = {
  server: string;
  mapGen: string;
  mapSettings: string;
};

function rawText(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value, null, 2);
}

function rawEditorsFrom(spec: FactorioServerSpec): RawEditors {
  return {
    server: rawText(spec.server?.raw),
    mapGen: rawText(spec.mapGenSettings?.raw),
    mapSettings: rawText(spec.mapSettings?.raw),
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

function numberOrUndefined(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

export function SettingsForm({
  server,
  defaults,
  effective,
  onSaved,
}: {
  server: FactorioServer;
  defaults: FactorioServerSpec;
  effective: FactorioServerSpec;
  onSaved: (server: FactorioServer, effective: FactorioServerSpec) => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      spec: structuredClone(effective),
      credentials: emptyCredentials(),
    },
    mode: "onBlur",
  });
  const { handleSubmit, reset, formState } = form;

  const [tab, setTab] = useState<string>(SETTINGS_SECTIONS[0].id);
  const [rawEditors, setRawEditors] = useState<RawEditors>(() =>
    rawEditorsFrom(effective),
  );
  const [initialRaw, setInitialRaw] = useState<RawEditors>(() =>
    rawEditorsFrom(effective),
  );
  const [rawError, setRawError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const rawDirty =
    rawEditors.server !== initialRaw.server ||
    rawEditors.mapGen !== initialRaw.mapGen ||
    rawEditors.mapSettings !== initialRaw.mapSettings;
  const dirty = formState.isDirty || rawDirty;

  const secretIsSet: Record<string, boolean> = {
    "credentials.gamePassword":
      server.spec.server?.access?.gamePasswordRef !== undefined,
    "credentials.password":
      server.spec.server?.authentication?.passwordRef !== undefined,
    "credentials.token":
      server.spec.server?.authentication?.tokenRef !== undefined,
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
      mapSettingsRaw = parseRawEditor(rawEditors.mapSettings, "mapSettings.raw");
    } catch (error) {
      setRawError(error instanceof Error ? error.message : "JSON invalide");
      setTab("advanced");
      return;
    }
    setRawError(null);

    const spec = structuredClone(values.spec);

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

      reset({ spec: structuredClone(merged), credentials: emptyCredentials() });
      setRawEditors(raw);
      setInitialRaw(raw);
      setSaved(true);
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
    reset({ spec: structuredClone(effective), credentials: emptyCredentials() });
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
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(String(value))}
          className="flex-col"
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            {SETTINGS_SECTIONS.map((section) => (
              <TabsTrigger key={section.id} value={section.id}>
                {section.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {SETTINGS_SECTIONS.map((section) => (
            <TabsContent
              key={section.id}
              value={section.id}
              keepMounted
              className="mt-4"
            >
              <SectionCard
                section={section}
                secretIsSet={secretIsSet}
                rawEditors={rawEditors}
                setRawEditors={setRawEditors}
                rawError={rawError}
              />
            </TabsContent>
          ))}
        </Tabs>

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
          {saved && !dirty && <Badge variant="secondary">Enregistré</Badge>}
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
      </form>
    </FormProvider>
  );
}

function SectionCard({
  section,
  secretIsSet,
  rawEditors,
  setRawEditors,
  rawError,
}: {
  section: SettingsSection;
  secretIsSet: Record<string, boolean>;
  rawEditors: RawEditors;
  setRawEditors: (editors: RawEditors) => void;
  rawError: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{section.title}</CardTitle>
          {section.badge !== undefined && (
            <Badge variant="secondary">{section.badge}</Badge>
          )}
        </div>
        {section.description !== undefined && (
          <CardDescription>{section.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {section.groups.map((group, index) => (
          <div key={group.title ?? index} className="flex flex-col gap-4">
            {group.title !== undefined && (
              <>
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold">{group.title}</h3>
                  <Separator className="flex-1" />
                </div>
              </>
            )}
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              {group.fields.map((field) => (
                <FieldRenderer
                  key={field.path}
                  definition={field}
                  secretIsSet={secretIsSet[field.path] === true}
                />
              ))}
            </FieldGroup>
          </div>
        ))}

        {section.custom === "autoplace" && <AutoplaceTable />}

        {section.custom === "raw" && (
          <RawEditors
            editors={rawEditors}
            setEditors={setRawEditors}
            error={rawError}
          />
        )}
      </CardContent>
    </Card>
  );
}

function FieldRenderer({
  definition,
  secretIsSet,
}: {
  definition: FieldDefinition;
  secretIsSet: boolean;
}) {
  const { control } = useFormContext<FormValues>();
  const path = definition.path as FieldPath<FormValues>;

  if (definition.kind === "secret") {
    return (
      <SecretField definition={definition} secretIsSet={secretIsSet} />
    );
  }

  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message;
        const content = (
          <>
            {definition.kind === "switch" ? (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={definition.path}>
                    {definition.label}
                  </FieldLabel>
                  {definition.help !== undefined && (
                    <FieldDescription>{definition.help}</FieldDescription>
                  )}
                </FieldContent>
                <Switch
                  id={definition.path}
                  checked={Boolean(field.value)}
                  onCheckedChange={(checked) => field.onChange(checked)}
                  aria-invalid={fieldState.invalid}
                />
              </Field>
            ) : (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={definition.path}>
                  {definition.label}
                </FieldLabel>
                {renderControl(definition, field, fieldState.invalid)}
                {definition.help !== undefined && (
                  <FieldDescription>{definition.help}</FieldDescription>
                )}
                {error !== undefined && <FieldError>{error}</FieldError>}
              </Field>
            )}
          </>
        );

        return definition.wide ? (
          <div className="sm:col-span-2">{content}</div>
        ) : (
          content
        );
      }}
    />
  );
}

function renderControl(
  definition: FieldDefinition,
  field: {
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
  },
  invalid: boolean,
) {
  switch (definition.kind) {
    case "number":
      return (
        <Input
          id={definition.path}
          type="number"
          step={definition.step ?? "1"}
          placeholder={definition.placeholder}
          value={
            typeof field.value === "number" || typeof field.value === "string"
              ? field.value
              : ""
          }
          onChange={(event) =>
            field.onChange(numberOrUndefined(event.target.value))
          }
          onBlur={field.onBlur}
          aria-invalid={invalid}
        />
      );
    case "textarea":
      return (
        <Textarea
          id={definition.path}
          placeholder={definition.placeholder}
          value={typeof field.value === "string" ? field.value : ""}
          onChange={(event) => field.onChange(event.target.value)}
          onBlur={field.onBlur}
          aria-invalid={invalid}
        />
      );
    case "tags":
      return (
        <Input
          id={definition.path}
          placeholder={definition.placeholder}
          value={
            Array.isArray(field.value) ? field.value.join(", ") : ""
          }
          onChange={(event) =>
            field.onChange(
              event.target.value
                .split(",")
                .map((tag) => tag.trim())
                .filter((tag) => tag !== ""),
            )
          }
          onBlur={field.onBlur}
          aria-invalid={invalid}
        />
      );
    case "select": {
      const options = (definition.options ?? []).map((option) => ({
        ...option,
        value: option.value === "" ? DEFAULT_SELECT_VALUE : option.value,
      }));
      const current =
        field.value === undefined ||
        field.value === null ||
        field.value === ""
          ? DEFAULT_SELECT_VALUE
          : String(field.value);

      return (
        <Select
          items={options}
          value={current}
          onValueChange={(value) =>
            field.onChange(
              value === DEFAULT_SELECT_VALUE
                ? undefined
                : definition.numeric
                  ? Number(value)
                  : value,
            )
          }
        >
          <SelectTrigger id={definition.path} aria-invalid={invalid}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    default:
      return (
        <Input
          id={definition.path}
          placeholder={definition.placeholder}
          value={typeof field.value === "string" ? field.value : ""}
          onChange={(event) =>
            field.onChange(
              definition.emptyAsUndefined && event.target.value === ""
                ? undefined
                : event.target.value,
            )
          }
          onBlur={field.onBlur}
          aria-invalid={invalid}
        />
      );
  }
}

function SecretField({
  definition,
  secretIsSet,
}: {
  definition: FieldDefinition;
  secretIsSet: boolean;
}) {
  const { control, watch } = useFormContext<FormValues>();
  const path = definition.path as FieldPath<FormValues>;
  const clearPath = definition.clearPath as FieldPath<FormValues>;
  const cleared = Boolean(watch(clearPath));

  return (
    <Field>
      <FieldLabel htmlFor={definition.path}>{definition.label}</FieldLabel>
      <Controller
        control={control}
        name={path}
        render={({ field }) => (
          <Input
            id={definition.path}
            type="password"
            disabled={cleared}
            value={typeof field.value === "string" ? field.value : ""}
            onChange={(event) => field.onChange(event.target.value)}
            placeholder={
              secretIsSet ? "Laisser vide pour conserver" : "Non défini"
            }
          />
        )}
      />
      {secretIsSet && (
        <Controller
          control={control}
          name={clearPath}
          render={({ field }) => (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={Boolean(field.value)}
                onCheckedChange={(checked) => field.onChange(checked)}
              />
              Effacer la valeur actuelle
            </label>
          )}
        />
      )}
      {definition.help !== undefined && (
        <FieldDescription>{definition.help}</FieldDescription>
      )}
    </Field>
  );
}

function AutoplaceTable() {
  const { register } = useFormContext<FormValues>();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold">Ressources (autoplace)</h3>
        <Separator className="flex-1" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">Ressource</th>
              <th className="px-1 pb-2 font-medium">Fréquence</th>
              <th className="px-1 pb-2 font-medium">Taille</th>
              <th className="px-1 pb-2 font-medium">Richesse</th>
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map((resource) => (
              <tr key={resource}>
                <td className="py-1 pr-3 font-mono text-xs">{resource}</td>
                {RESOURCE_FIELDS.map((field) => (
                  <td key={field} className="p-1">
                    <Input
                      type="number"
                      step="0.1"
                      className="h-8"
                      {...register(
                        `spec.mapGenSettings.autoplaceControls.${resource}.${field}` as FieldPath<FormValues>,
                        {
                          setValueAs: (value: unknown) =>
                            value === "" ? undefined : Number(value),
                        },
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RawEditors({
  editors,
  setEditors,
  error,
}: {
  editors: RawEditors;
  setEditors: (editors: RawEditors) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor="raw-server">server.raw</FieldLabel>
        <Textarea
          id="raw-server"
          className="font-mono text-xs"
          rows={8}
          value={editors.server}
          onChange={(event) =>
            setEditors({ ...editors, server: event.target.value })
          }
          spellCheck={false}
        />
        <FieldDescription>
          Ex. : minimum_segment_size, auto_pause_when_players_connect.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="raw-mapgen">mapGenSettings.raw</FieldLabel>
        <Textarea
          id="raw-mapgen"
          className="font-mono text-xs"
          rows={8}
          value={editors.mapGen}
          onChange={(event) =>
            setEditors({ ...editors, mapGen: event.target.value })
          }
          spellCheck={false}
        />
        <FieldDescription>
          Ex. : property_expression_names, autres entités autoplace.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="raw-map">mapSettings.raw</FieldLabel>
        <Textarea
          id="raw-map"
          className="font-mono text-xs"
          rows={8}
          value={editors.mapSettings}
          onChange={(event) =>
            setEditors({ ...editors, mapSettings: event.target.value })
          }
          spellCheck={false}
        />
        <FieldDescription>
          Ex. : unit_group, path_finder, asteroids.
        </FieldDescription>
      </Field>
    </div>
  );
}
