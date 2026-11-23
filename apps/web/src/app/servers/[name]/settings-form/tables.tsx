"use client";

import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import {
  MAP_GEN_SIZE_OPTIONS,
  RESOURCES,
  RESOURCE_FIELDS,
} from "@/lib/settings-registry";
import type { FormValues } from "@/lib/settings-registry";

import { EditableInput, SelectControl } from "./controls";
import type { RawEditors as RawEditorText } from "./helpers";

export function StartingPointsTable() {
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

export function AutoplaceTable() {
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

export function RawEditors({
  editors,
  setEditors,
  error,
}: {
  editors: RawEditorText;
  setEditors: (editors: RawEditorText) => void;
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
