"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  factorioServerSpecSchema,
  type CredentialsInput,
  type FactorioServer,
  type FactorioServerSpec,
} from "@factorio/shared";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
  type FieldErrors,
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
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { updateServer } from "@/lib/api";
import { SettingsJsonPanel } from "./settings-json";
import {
  MAP_GEN_SIZE_OPTIONS,
  RESOURCES,
  RESOURCE_FIELDS,
  SETTINGS_SECTIONS,
  buildSections,
  diffAgainstDefaults,
  emptyCredentials,
  mergeWithDefaults,
  type FieldDefinition,
  type FormValues,
  type SettingsSection,
} from "@/lib/settings-registry";
import {
  describeBounds,
  type JsonSchemaNode,
  type SettingsSchema,
} from "@/lib/settings-schema";

const DEFAULT_SELECT_VALUE = "__default__";
const CUSTOM_SELECT_VALUE = "__custom__";

function parseCpu(value: string): number | undefined {
  const match = /^([0-9.]+)(m|u|n)?$/.exec(value.trim());
  if (match === null) {
    return undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return undefined;
  }
  switch (match[2]) {
    case "n":
      return amount / 1_000_000;
    case "u":
      return amount / 1_000;
    case "m":
      return amount;
    default:
      return amount * 1000;
  }
}

function parseMemory(value: string): number | undefined {
  const match = /^([0-9.]+)(Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)?$/.exec(
    value.trim(),
  );
  if (match === null) {
    return undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return undefined;
  }
  const units: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
    E: 1e18,
  };
  return match[2] === undefined ? amount : amount * (units[match[2]] ?? 1);
}

function resourceLimitIssue(
  spec: FactorioServerSpec,
): { path: string; message: string } | undefined {
  const resources = spec.resources;
  if (resources === undefined) {
    return undefined;
  }

  const cpuRequest = resources.cpuRequest
    ? parseCpu(resources.cpuRequest)
    : undefined;
  const cpuLimit = resources.cpuLimit
    ? parseCpu(resources.cpuLimit)
    : undefined;
  if (
    cpuRequest !== undefined &&
    cpuLimit !== undefined &&
    cpuLimit < cpuRequest
  ) {
    return {
      path: "spec.resources.cpuLimit",
      message: "La limite CPU doit être supérieure ou égale à la CPU request.",
    };
  }

  const memoryRequest = resources.memoryRequest
    ? parseMemory(resources.memoryRequest)
    : undefined;
  const memoryLimit = resources.memoryLimit
    ? parseMemory(resources.memoryLimit)
    : undefined;
  if (
    memoryRequest !== undefined &&
    memoryLimit !== undefined &&
    memoryLimit < memoryRequest
  ) {
    return {
      path: "spec.resources.memoryLimit",
      message:
        "La limite mémoire doit être supérieure ou égale à la mémoire request.",
    };
  }

  return undefined;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
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
}).superRefine((values, ctx) => {
  const issue = resourceLimitIssue(values.spec);
  if (issue !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: issue.path.split("."),
      message: issue.message,
    });
  }
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
  if (value.trim() === "") {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function inputValue(value: unknown): string {
  return typeof value === "number" || typeof value === "string"
    ? String(value)
    : "";
}

function withFormDefaults(spec: FactorioServerSpec): FactorioServerSpec {
  const result = structuredClone(spec);
  result.mapGenSettings = {
    ...(result.mapGenSettings ?? {}),
    startingPoints: result.mapGenSettings?.startingPoints ?? [],
  };
  return result;
}

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

  const [tab, setTab] = useState<string>(SETTINGS_SECTIONS[0].id);  const [rawEditors, setRawEditors] = useState<RawEditors>(() =>
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

function SectionCard({
  section,
  serverName,
  secretIsSet,
  rawEditors,
  setRawEditors,
  rawError,
}: {
  section: SettingsSection;
  serverName: string;
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

        {section.custom === "autoplace" && (
          <div className="flex flex-col gap-8">
            <AutoplaceTable />
            <StartingPointsTable />
          </div>
        )}

        {section.custom === "raw" && (
          <div className="flex flex-col gap-8">
            <RawEditors
              editors={rawEditors}
              setEditors={setRawEditors}
              error={rawError}
            />
            <Separator />
            <SettingsJsonPanel name={serverName} />
          </div>
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
        const bounds = describeBounds(definition.schema);
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
                {bounds !== undefined && (
                  <FieldDescription>{bounds}</FieldDescription>
                )}
                {error !== undefined && <FieldError>{error}</FieldError>}
              </Field>
            )}
          </>
        );

        return definition.wide || definition.kind === "switch" ? (
          <div className="sm:col-span-2">{content}</div>
        ) : (
          content
        );
      }}
    />
  );
}

function isIntegerNode(node?: JsonSchemaNode): boolean {
  return (
    node?.type === "integer" ||
    node?.format === "int32" ||
    node?.format === "int64"
  );
}

function clampNumber(
  value: unknown,
  node?: JsonSchemaNode,
): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return undefined;
  }

  let next = number;
  if (node?.minimum !== undefined) {
    next = Math.max(next, node.minimum);
  }
  if (node?.maximum !== undefined) {
    next = Math.min(next, node.maximum);
  }
  if (isIntegerNode(node)) {
    next = Math.round(next);
  }
  return next;
}

function smallRangeOptions(
  node?: JsonSchemaNode,
): { value: string; label: string }[] | undefined {
  if (
    node?.minimum === undefined ||
    node.maximum === undefined ||
    !isIntegerNode(node)
  ) {
    return undefined;
  }

  const min = Math.ceil(node.minimum);
  const max = Math.floor(node.maximum);
  if (max < min || max - min > 12) {
    return undefined;
  }

  return Array.from({ length: max - min + 1 }, (_, index) => {
    const value = min + index;
    return { value: String(value), label: String(value) };
  });
}

function selectOptions(
  definition: FieldDefinition,
  node?: JsonSchemaNode,
): { value: string; label: string }[] {
  if (definition.options !== undefined) {
    return definition.options;
  }
  if (node?.enum !== undefined) {
    return [
      { value: "", label: "Défaut" },
      ...node.enum.map((value) => ({
        value: String(value),
        label: String(value),
      })),
    ];
  }

  const range = smallRangeOptions(node);
  if (range !== undefined) {
    return [{ value: "", label: "Défaut" }, ...range];
  }

  return [];
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
  if (definition.readOnly) {
    const options = definition.options ?? [];
    const value =
      field.value === undefined || field.value === null
        ? ""
        : String(field.value);
    const label =
      options.find((option) => option.value === value)?.label ??
      (value === "" ? "Défaut" : value);

    return (
      <Input
        id={definition.path}
        value={label}
        readOnly
        aria-readonly="true"
        aria-invalid={invalid}
        className="bg-muted/30 text-muted-foreground"
      />
    );
  }

  if (definition.kind === "quantity") {
    return (
      <QuantityControl definition={definition} field={field} invalid={invalid} />
    );
  }

  const node = definition.schema;
  const isNumber = definition.kind === "number" ||
    node?.type === "integer" ||
    node?.type === "number";
  if (isNumber) {
    const options = definition.options === undefined
      ? smallRangeOptions(node)
      : undefined;
    const hasEnum = node?.enum !== undefined;
    const useSelect =
      hasEnum ||
      (definition.kind === "select" && definition.options !== undefined) ||
      options !== undefined;

    if (useSelect) {
      return (
        <SelectControl
          definition={definition}
          field={field}
          invalid={invalid}
          node={node}
        />
      );
    }

    return (
      <EditableInput
        definition={definition}
        field={field}
        invalid={invalid}
        numeric
      />
    );
  }

  if (definition.kind === "select") {
    return (
      <SelectControl
        definition={definition}
        field={field}
        invalid={invalid}
        node={node}
      />
    );
  }

  if (definition.kind === "textarea") {
    return (
      <Textarea
        id={definition.path}
        placeholder={definition.placeholder}
        maxLength={node?.maxLength}
        value={typeof field.value === "string" ? field.value : ""}
        onChange={(event) => field.onChange(event.target.value)}
        onBlur={field.onBlur}
        aria-invalid={invalid}
      />
    );
  }

  if (definition.kind === "tags") {
    return (
      <Input
        id={definition.path}
        placeholder={definition.placeholder}
        value={Array.isArray(field.value) ? field.value.join(", ") : ""}
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
  }

  return (
    <EditableInput
      definition={definition}
      field={field}
      invalid={invalid}
      numeric={false}
    />
  );
}

function EditableInput({
  definition,
  field,
  invalid,
  numeric,
}: {
  definition: FieldDefinition;
  field: {
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
  };
  invalid: boolean;
  numeric: boolean;
}) {
  const node = definition.schema;
  const listId = `suggestions-${definition.path.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const suggestions = definition.suggestions ?? [];
  const isInteger = isIntegerNode(node);
  const [text, setText] = useState(() => inputValue(field.value));
  const lastValue = useRef(field.value);

  useEffect(() => {
    if (!Object.is(field.value, lastValue.current)) {
      lastValue.current = field.value;
      setText(inputValue(field.value));
    }
  }, [field.value]);

  function commit(value: string) {
    if (numeric) {
      const next = numberOrUndefined(value);
      lastValue.current = next;
      field.onChange(next);
      return;
    }

    const next =
      definition.emptyAsUndefined && value === "" ? undefined : value;
    lastValue.current = next;
    field.onChange(next);
  }

  return (
    <>
      <Input
        id={definition.path}
        type="text"
        inputMode={numeric ? (isInteger ? "numeric" : "decimal") : undefined}
        list={suggestions.length > 0 ? listId : undefined}
        maxLength={numeric ? undefined : node?.maxLength}
        placeholder={definition.placeholder}
        value={text}
        onChange={(event) => {
          const value = event.target.value;
          setText(value);
          commit(value);
        }}
        onBlur={() => {
          if (numeric) {
            const clamped = clampNumber(text, node);
            lastValue.current = clamped;
            field.onChange(clamped);
            setText(clamped === undefined ? "" : String(clamped));
          }
          field.onBlur();
        }}
        aria-invalid={invalid}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      )}
    </>
  );
}

function selectCurrent(value: unknown): string {
  return value === undefined || value === null || value === ""
    ? DEFAULT_SELECT_VALUE
    : String(value);
}

function QuantityControl({
  definition,
  field,
  invalid,
}: {
  definition: FieldDefinition;
  field: {
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
  };
  invalid: boolean;
}) {
  const { control } = useFormContext<FormValues>();
  const cpuRequest = useWatch({ control, name: "spec.resources.cpuRequest" });
  const cpuLimit = useWatch({ control, name: "spec.resources.cpuLimit" });
  const memoryRequest = useWatch({
    control,
    name: "spec.resources.memoryRequest",
  });
  const memoryLimit = useWatch({
    control,
    name: "spec.resources.memoryLimit",
  });
  const presets = useMemo(() => {
    const all = definition.suggestions ?? [];
    const filter = (
      parse: (value: string) => number | undefined,
      boundary: unknown,
      keep: (value: number, limit: number) => boolean,
    ) => {
      const limit = parse(inputValue(boundary));
      if (limit === undefined) {
        return all;
      }
      return all.filter((preset) => {
        const value = parse(preset);
        return value !== undefined && keep(value, limit);
      });
    };

    switch (definition.path) {
      case "spec.resources.cpuLimit":
        return filter(parseCpu, cpuRequest, (value, request) => value >= request);
      case "spec.resources.cpuRequest":
        return filter(parseCpu, cpuLimit, (value, limit) => value <= limit);
      case "spec.resources.memoryLimit":
        return filter(
          parseMemory,
          memoryRequest,
          (value, request) => value >= request,
        );
      case "spec.resources.memoryRequest":
        return filter(parseMemory, memoryLimit, (value, limit) => value <= limit);
      default:
        return all;
    }
  }, [
    definition.path,
    definition.suggestions,
    cpuRequest,
    cpuLimit,
    memoryRequest,
    memoryLimit,
  ]);
  const current = inputValue(field.value);
  const [custom, setCustom] = useState(
    () => current !== "" && !presets.includes(current),
  );

  const selectValue = custom
    ? CUSTOM_SELECT_VALUE
    : current === ""
      ? DEFAULT_SELECT_VALUE
      : presets.includes(current)
        ? current
        : CUSTOM_SELECT_VALUE;
  const customLabel =
    current !== "" && !presets.includes(current)
      ? `Personnalisé (${current})`
      : "Personnalisé…";
  const defaultValid = (() => {
    const defaultValue = inputValue(definition.defaultValue);
    if (defaultValue === "") {
      return true;
    }
    switch (definition.path) {
      case "spec.resources.cpuLimit":
        return (parseCpu(defaultValue) ?? 0) >= (parseCpu(inputValue(cpuRequest)) ?? 0);
      case "spec.resources.cpuRequest":
        return (parseCpu(defaultValue) ?? 0) <= (parseCpu(inputValue(cpuLimit)) ?? Number.POSITIVE_INFINITY);
      case "spec.resources.memoryLimit":
        return (parseMemory(defaultValue) ?? 0) >= (parseMemory(inputValue(memoryRequest)) ?? 0);
      case "spec.resources.memoryRequest":
        return (parseMemory(defaultValue) ?? 0) <= (parseMemory(inputValue(memoryLimit)) ?? Number.POSITIVE_INFINITY);
      default:
        return true;
    }
  })();
  const normalized = [
    ...(defaultValid
      ? [{ value: DEFAULT_SELECT_VALUE, label: "Défaut" }]
      : []),
    ...presets
      .filter((preset) => preset !== "")
      .map((preset) => ({ value: preset, label: preset })),
    { value: CUSTOM_SELECT_VALUE, label: customLabel },
  ];

  return (
    <div className="flex flex-col gap-2">
      <Select
        items={normalized}
        value={selectValue}
        onValueChange={(value) => {
          if (value === null) {
            return;
          }
          if (value === DEFAULT_SELECT_VALUE) {
            setCustom(false);
            field.onChange(undefined);
            return;
          }
          if (value === CUSTOM_SELECT_VALUE) {
            setCustom(true);
            return;
          }
          setCustom(false);
          field.onChange(value);
        }}
      >
        <SelectTrigger
          id={definition.path}
          className="w-full"
          disabled={custom}
          aria-invalid={invalid}
          onBlur={field.onBlur}
        >
          <span data-slot="select-value" className="flex flex-1 text-left">
            {normalized.find((option) => option.value === selectValue)?.label ??
              "Défaut"}
          </span>
        </SelectTrigger>
        <SelectContent>
          {normalized.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {custom && (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${definition.path}-custom`}
            className="text-xs text-muted-foreground"
          >
            Valeur personnalisée
          </label>
          <EditableInput
            definition={{
              ...definition,
              path: `${definition.path}-custom`,
              suggestions: [],
            }}
            field={field}
            invalid={invalid}
            numeric={false}
          />
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto self-start p-0 text-xs"
            onClick={() => setCustom(false)}
          >
            Choisir un préréglage
          </Button>
        </div>
      )}
    </div>
  );
}

function SelectControl({
  definition,
  field,
  invalid,
  node,
  compact = false,
}: {
  definition: FieldDefinition;
  field: {
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
  };
  invalid: boolean;
  node?: JsonSchemaNode;
  compact?: boolean;
}) {
  const options = selectOptions(definition, node);
  const normalized = options.map((option) => ({
    ...option,
    value: option.value === "" ? DEFAULT_SELECT_VALUE : option.value,
  }));
  if (!normalized.some((option) => option.value === DEFAULT_SELECT_VALUE)) {
    normalized.unshift({ value: DEFAULT_SELECT_VALUE, label: "Défaut" });
  }

  const [local, setLocal] = useState(() => selectCurrent(field.value));
  const lastValue = useRef(field.value);
  const pendingChange = useRef(false);

  useEffect(() => {
    if (pendingChange.current) {
      pendingChange.current = false;
      lastValue.current = field.value;
      return;
    }
    if (!Object.is(field.value, lastValue.current)) {
      lastValue.current = field.value;
      setLocal(selectCurrent(field.value));
    }
  }, [field.value]);

  if (
    local !== DEFAULT_SELECT_VALUE &&
    !normalized.some((option) => option.value === local)
  ) {
    normalized.push({
      value: local,
      label: `Personnalisé (${local})`,
    });
  }

  const numeric =
    definition.numeric === true ||
    node?.type === "integer" ||
    node?.type === "number";

  return (
    <Select
      items={normalized}
      value={local}
      onValueChange={(value) => {
        const nextValue = value === null ? DEFAULT_SELECT_VALUE : value;
        const next =
          nextValue === DEFAULT_SELECT_VALUE
            ? undefined
            : numeric
              ? Number(nextValue)
              : nextValue;
        lastValue.current = next;
        pendingChange.current = true;
        setLocal(nextValue);
        field.onChange(next);
      }}
    >
      <SelectTrigger
        id={definition.path}
        size={compact ? "sm" : "default"}
        className={compact ? "w-full" : undefined}
        aria-invalid={invalid}
        onBlur={field.onBlur}
      >
        <span data-slot="select-value" className="flex flex-1 text-left">
          {normalized.find((option) => option.value === local)?.label ??
            "Défaut"}
        </span>
      </SelectTrigger>
      <SelectContent>
        {normalized.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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

function StartingPointsTable() {
  const { control } = useFormContext<FormValues>();
  const { fields, append, remove } = useFieldArray<FormValues>({
    control,
    name: "spec.mapGenSettings.startingPoints",
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">Points de départ</h3>
        <Separator className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ x: 0, y: 0 })}
        >
          Ajouter un point
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Coordonnées des positions de départ. Un point à (0, 0) est la carte
        standard.
      </p>
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun point explicite : Factorio utilise la position par défaut.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {fields.map((point, index) => (
            <div
              key={point.id}
              className="flex flex-wrap items-end gap-2 rounded-md border p-2"
            >
              {(["x", "y"] as const).map((axis) => (
                <div key={axis} className="flex flex-1 flex-col gap-1">
                  <label
                    className="text-xs text-muted-foreground uppercase"
                    htmlFor={`starting-point-${index}-${axis}`}
                  >
                    {axis}
                  </label>
                  <Controller
                    control={control}
                    name={
                      `spec.mapGenSettings.startingPoints.${index}.${axis}` as FieldPath<FormValues>
                    }
                    render={({ field }) => (
                      <EditableInput
                        definition={{
                          path: `starting-point-${index}-${axis}`,
                          label: axis,
                          kind: "number",
                        }}
                        field={field}
                        invalid={false}
                        numeric
                      />
                    )}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(index)}
              >
                Retirer
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const RICHNESS_RESOURCES = new Set([
  "coal",
  "stone",
  "copper-ore",
  "iron-ore",
  "uranium-ore",
  "crude-oil",
]);

function AutoplaceTable() {
  const { control, setValue, getValues } = useFormContext<FormValues>();
  const [newResource, setNewResource] = useState("");
  const controls = useWatch({
    control,
    name: "spec.mapGenSettings.autoplaceControls",
  }) as Record<string, unknown> | undefined;
  const resourceNames = useMemo(() => {
    const extra = Object.keys(controls ?? {}).filter(
      (name) => !(RESOURCES as readonly string[]).includes(name),
    );
    return [...RESOURCES, ...extra.sort()];
  }, [controls]);

  function addResource() {
    const name = newResource.trim();
    if (
      name === "" ||
      resourceNames.includes(name) ||
      !/^[a-z0-9][a-z0-9_-]*$/.test(name)
    ) {
      return;
    }

    setValue(
      `spec.mapGenSettings.autoplaceControls.${name}` as FieldPath<FormValues>,
      { frequency: 1, size: 1, richness: 1 },
      { shouldDirty: true },
    );
    setNewResource("");
  }

  function removeResource(name: string) {
    const current = getValues("spec.mapGenSettings.autoplaceControls");
    if (current === undefined) {
      return;
    }

    const next = { ...current };
    delete next[name];
    setValue("spec.mapGenSettings.autoplaceControls", next, {
      shouldDirty: true,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">Ressources (autoplace)</h3>
        <Separator className="flex-1" />
        <Input
          value={newResource}
          onChange={(event) => setNewResource(event.target.value)}
          placeholder="nom de ressource"
          className="h-8 w-40"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addResource();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={addResource}>
          Ajouter
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Valeurs du générateur Factorio (0 à 6). La richesse n&apos;est pas
        utilisée par l&apos;eau, les arbres ni les bases ennemies.
      </p>
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
            {resourceNames.map((resource) => (
              <tr key={resource}>
                <td className="py-1 pr-3 font-mono text-xs">
                  <div className="flex items-center gap-1">
                    <span>{resource}</span>
                    {!(RESOURCES as readonly string[]).includes(resource) && (
                      <button
                        type="button"
                        aria-label={`Retirer ${resource}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeResource(resource)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </td>
                {RESOURCE_FIELDS.map((field) => {
                  const usesRichness =
                    RICHNESS_RESOURCES.has(resource) ||
                    !(RESOURCES as readonly string[]).includes(resource);
                  if (field === "richness" && !usesRichness) {
                    return (
                      <td
                        key={field}
                        className="p-1 text-center text-xs text-muted-foreground"
                      >
                        —
                      </td>
                    );
                  }

                  const path =
                    `spec.mapGenSettings.autoplaceControls.${resource}.${field}` as FieldPath<FormValues>;

                  return (
                    <td key={field} className="p-1">
                      <Controller
                        control={control}
                        name={path}
                        render={({ field: controller }) => (
                          <SelectControl
                            definition={{
                              path,
                              label: `${resource} ${field}`,
                              kind: "select",
                              numeric: true,
                              options: MAP_GEN_SIZE_OPTIONS,
                            }}
                            field={controller}
                            invalid={false}
                            compact
                          />
                        )}
                      />
                    </td>
                  );
                })}
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
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Clés supplémentaires (raw)</h3>
        <p className="text-sm text-muted-foreground">
          Uniquement les clés non exposées par les formulaires typés.
        </p>
      </div>
      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor="raw-server">server-settings.json (raw)</FieldLabel>
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
        <FieldLabel htmlFor="raw-mapgen">map-gen-settings.json (raw)</FieldLabel>
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
        <FieldLabel htmlFor="raw-map">map-settings.json (raw)</FieldLabel>
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
