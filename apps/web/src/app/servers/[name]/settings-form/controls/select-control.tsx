"use client";

import { useEffect, useRef, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

import type { FieldDefinition } from "@/lib/settings-registry";
import type { JsonSchemaNode } from "@/lib/settings-schema";

import {
  DEFAULT_SELECT_VALUE,
  selectCurrent,
  selectOptions,
  type EditableField,
} from "../helpers";

export function SelectControl({
  definition,
  field,
  invalid,
  node,
  compact = false,
}: {
  definition: FieldDefinition;
  field: EditableField;
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

