/**
 * Minimal OpenAPI schema types used by the generated settings form. The API
 * serves the FactorioServer CRD spec schema; bounds, enums and defaults come
 * from there instead of being duplicated in the UI.
 */
export interface JsonSchemaNode {
  type?: string;
  format?: string;
  properties?: Record<string, JsonSchemaNode>;
  additionalProperties?: JsonSchemaNode | boolean;
  items?: JsonSchemaNode;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
  description?: string;
  pattern?: string;
}

export type SettingsSchema = JsonSchemaNode;

export function schemaAt(
  root: SettingsSchema | null | undefined,
  path: string,
): JsonSchemaNode | undefined {
  if (root === null || root === undefined) {
    return undefined;
  }

  const parts = path.replace(/^spec\./, "").split(".").filter(Boolean);
  let node: JsonSchemaNode | undefined = root;

  for (const part of parts) {
    node = node?.properties?.[part];
    if (node === undefined) {
      return undefined;
    }
  }

  return node;
}

export function valueAtPath(value: unknown, path: string): unknown {
  const parts = path.replace(/^spec\./, "").split(".").filter(Boolean);
  let current: unknown = value;

  for (const part of parts) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export function humanizeName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();

  return words === "" ? name : words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatBound(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 6,
  }).format(value);
}

export function describeBounds(node?: JsonSchemaNode): string | undefined {
  if (node === undefined) {
    return undefined;
  }

  if (node.minimum !== undefined && node.maximum !== undefined) {
    return `Entre ${formatBound(node.minimum)} et ${formatBound(node.maximum)}.`;
  }
  if (node.minimum !== undefined) {
    return `Minimum ${formatBound(node.minimum)}.`;
  }
  if (node.maximum !== undefined) {
    return `Maximum ${formatBound(node.maximum)}.`;
  }
  return undefined;
}

/**
 * Values exposed by the Factorio map generation GUI. Factorio documents the
 * MapGenSize range as 0 or 1/6..6; these are the slider positions.
 */
export const MAP_GEN_SIZE_VALUES = [
  { value: 0, label: "Aucun (0 %)" },
  { value: 1 / 6, label: "Très bas (17 %)" },
  { value: 0.5, label: "Bas (50 %)" },
  { value: 0.75, label: "Un peu bas (75 %)" },
  { value: 1, label: "Normal (100 %)" },
  { value: 1.5, label: "Un peu haut (150 %)" },
  { value: 2, label: "Haut (200 %)" },
  { value: 3, label: "Très haut (300 %)" },
  { value: 6, label: "Extrême (600 %)" },
] as const;
