"use client";

import { Controller, useFormContext, type FieldPath } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { FieldDefinition, FormValues } from "@/lib/settings-registry";

export function SecretField({
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
