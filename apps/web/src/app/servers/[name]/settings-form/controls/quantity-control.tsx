"use client";

import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

import type { FieldDefinition, FormValues } from "@/lib/settings-registry";

import {
  CUSTOM_SELECT_VALUE,
  DEFAULT_SELECT_VALUE,
  inputValue,
  type EditableField,
} from "../helpers";
import { parseCpu, parseMemory } from "../validation";
import { EditableInput } from "./editable-input";

export function QuantityControl({
  definition,
  field,
  invalid,
}: {
  definition: FieldDefinition;
  field: EditableField;
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

