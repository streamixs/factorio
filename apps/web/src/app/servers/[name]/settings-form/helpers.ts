import type { FactorioServerSpec } from "@factorio/shared";

import type { FieldDefinition } from "@/lib/settings-registry";
import type { JsonSchemaNode } from "@/lib/settings-schema";

export const DEFAULT_SELECT_VALUE = "__default__";
export const CUSTOM_SELECT_VALUE = "__custom__";

export type EditableField = {
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
};

export type RawEditors = {
  server: string;
  mapGen: string;
  mapSettings: string;
};

function rawText(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value, null, 2);
}

export function rawEditorsFrom(spec: FactorioServerSpec): RawEditors {
  return {
    server: rawText(spec.server?.raw),
    mapGen: rawText(spec.mapGenSettings?.raw),
    mapSettings: rawText(spec.mapSettings?.raw),
  };
}

export function parseRawEditor(
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

export function numberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function inputValue(value: unknown): string {
  return typeof value === "number" || typeof value === "string"
    ? String(value)
    : "";
}

export function withFormDefaults(spec: FactorioServerSpec): FactorioServerSpec {
  const result = structuredClone(spec);
  result.mapGenSettings = {
    ...(result.mapGenSettings ?? {}),
    startingPoints: result.mapGenSettings?.startingPoints ?? [],
  };
  return result;
}

export function isIntegerNode(node?: JsonSchemaNode): boolean {
  return (
    node?.type === "integer" ||
    node?.format === "int32" ||
    node?.format === "int64"
  );
}

export function clampNumber(
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

export function smallRangeOptions(
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

export function selectOptions(
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

export function selectCurrent(value: unknown): string {
  return value === undefined || value === null || value === ""
    ? DEFAULT_SELECT_VALUE
    : String(value);
}
