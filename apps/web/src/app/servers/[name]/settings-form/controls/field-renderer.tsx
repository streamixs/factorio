"use client";

import { Controller, useFormContext, type FieldPath } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { FieldDefinition, FormValues } from "@/lib/settings-registry";
import { describeBounds } from "@/lib/settings-schema";

import { smallRangeOptions, type EditableField } from "../helpers";
import { EditableInput } from "./editable-input";
import { QuantityControl } from "./quantity-control";
import { SecretField } from "./secret-field";
import { SelectControl } from "./select-control";

export function FieldRenderer({
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

function renderControl(
  definition: FieldDefinition,
  field: EditableField,
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

