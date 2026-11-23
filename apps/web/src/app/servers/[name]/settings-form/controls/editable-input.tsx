"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

import type { FieldDefinition } from "@/lib/settings-registry";

import {
  clampNumber,
  inputValue,
  isIntegerNode,
  numberOrUndefined,
  type EditableField,
} from "../helpers";

export function EditableInput({
  definition,
  field,
  invalid,
  numeric,
}: {
  definition: FieldDefinition;
  field: EditableField;
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

