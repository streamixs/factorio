import type { FactorioServerSpec } from "@factorio/shared";

import {
  humanizeName,
  schemaAt,
  type JsonSchemaNode,
  type SettingsSchema,
  valueAtPath,
} from "../settings-schema";

import { SUGGESTIONS } from "./catalog";
import { SETTINGS_SECTIONS } from "./sections";
import type {
  CatalogOptions,
  FieldDefinition,
  FieldKind,
  SettingsSection,
} from "./types";

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value !== ""))];
}

function autoKind(node: JsonSchemaNode): FieldKind {
  if (node.enum !== undefined) {
    return "select";
  }
  if (node.type === "boolean") {
    return "switch";
  }
  if (node.type === "integer" || node.type === "number") {
    return "number";
  }
  return "text";
}

function collectLeaves(
  node: JsonSchemaNode,
  prefix: string,
  out: { path: string; key: string; node: JsonSchemaNode }[],
): void {
  if (node.properties === undefined) {
    return;
  }

  for (const [key, child] of Object.entries(node.properties)) {
    if (key === "raw" || /[Rr]ef$/.test(key)) {
      continue;
    }

    const path = `${prefix}.${key}`;
    if (child.properties !== undefined) {
      collectLeaves(child, path, out);
      continue;
    }
    if (child.type === "array" || child.items !== undefined) {
      continue;
    }
    if (child.additionalProperties !== undefined &&
        child.additionalProperties !== false) {
      continue;
    }
    if (child.type === undefined && child.enum === undefined) {
      continue;
    }

    out.push({ path, key, node: child });
  }
}

function buildAutoSection(
  schema: SettingsSchema | null,
  defaults: FactorioServerSpec,
  sections: SettingsSection[],
): SettingsSection | null {
  if (schema === null) {
    return null;
  }

  const known = new Set(
    sections.flatMap((section) =>
      section.groups.flatMap((group) => group.fields.map((field) => field.path)),
    ),
  );
  const leaves: { path: string; key: string; node: JsonSchemaNode }[] = [];
  collectLeaves(schema, "spec", leaves);

  const groups = new Map<string, FieldDefinition[]>();
  for (const leaf of leaves) {
    if (known.has(leaf.path) || leaf.path === "spec.suspended") {
      continue;
    }

    const defaultValue = valueAtPath(defaults, leaf.path);
    const field: FieldDefinition = {
      path: leaf.path,
      label: humanizeName(leaf.key),
      kind: autoKind(leaf.node),
      help: leaf.node.description,
      schema: leaf.node,
      defaultValue,
      suggestions: unique([
        ...(SUGGESTIONS[leaf.path] ?? []),
        ...(defaultValue === undefined ? [] : [String(defaultValue)]),
      ]),
      numeric:
        leaf.node.type === "integer" || leaf.node.type === "number",
    };

    const parent = leaf.path.split(".").slice(0, -1).join(".");
    const group = groups.get(parent) ?? [];
    group.push(field);
    groups.set(parent, group);
  }

  if (groups.size === 0) {
    return null;
  }

  return {
    id: "auto",
    title: "Autres paramètres",
    badge: "Généré depuis le CRD",
    description:
      "Champs présents dans le schéma du CRD mais pas encore dans le catalogue. Ils sont rendus automatiquement.",
    groups: [...groups.entries()].map(([parent, fields]) => ({
      title: humanizeName(parent.split(".").slice(-1)[0] ?? parent),
      fields,
    })),
  };
}

function dynamicFieldOptions(
  field: FieldDefinition,
  catalog: CatalogOptions,
): Partial<
  Pick<FieldDefinition, "kind" | "options" | "suggestions">
> {
  if (field.path === "spec.version") {
    const versions = catalog.versions ?? [];
    if (versions.length > 0) {
      return {
        kind: "select",
        options: [
          { value: "", label: "Défaut" },
          ...versions.map((version) => ({ value: version, label: version })),
        ],
        suggestions: [],
      };
    }
    return { suggestions: [] };
  }

  if (field.path === "spec.storage.storageClassName") {
    const storageClasses = catalog.storageClasses ?? [];
    if (storageClasses.length > 0) {
      return {
        kind: "select",
        options: [
          { value: "", label: "Défaut du cluster" },
          ...storageClasses.map((name) => ({ value: name, label: name })),
        ],
        suggestions: [],
      };
    }
    return { suggestions: [] };
  }

  return {};
}

/**
 * Builds the visible sections from the curated catalog and the CRD schema.
 * Fields keep their curated labels/groups; types, bounds, enums and defaults
 * come from the schema. Unknown schema fields are appended automatically.
 */
export function buildSections(
  schema: SettingsSchema | null,
  defaults: FactorioServerSpec,
  catalog: CatalogOptions = {},
): SettingsSection[] {
  const sections: SettingsSection[] = SETTINGS_SECTIONS.map((section) => ({
    ...section,
    groups: section.groups.map((group) => ({
      ...group,
      fields: group.fields.map((field) => {
        const node = schemaAt(schema, field.path);
        const defaultValue = valueAtPath(defaults, field.path);
        const dynamic = dynamicFieldOptions(field, catalog);
        return {
          ...field,
          ...dynamic,
          schema: node,
          defaultValue,
          suggestions:
            dynamic.suggestions ??
            unique([
              ...(SUGGESTIONS[field.path] ?? []),
              ...(defaultValue === undefined ? [] : [String(defaultValue)]),
              ...(node?.enum === undefined ? [] : node.enum.map(String)),
            ]),
        };
      }),
    })),
  }));

  const auto = buildAutoSection(schema, defaults, sections);
  if (auto !== null) {
    sections.push(auto);
  }
  return sections;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arraysEqual(left: unknown[], right: unknown): boolean {
  if (!Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every(
    (value, index) => JSON.stringify(value) === JSON.stringify(right[index]),
  );
}

/**
 * Returns only the values that differ from the defaults. The custom resource
 * stays sparse: a value equal to the Factorio default is omitted so the
 * renderer keeps applying its own default.
 */
export function diffAgainstDefaults(
  current: unknown,
  defaults: unknown,
): unknown {
  if (current === undefined) {
    return undefined;
  }

  if (Array.isArray(current)) {
    return arraysEqual(current, defaults) ? undefined : current;
  }

  if (isRecord(current)) {
    const base = isRecord(defaults) ? defaults : {};
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(current)) {
      const diff = diffAgainstDefaults(value, base[key]);
      if (diff !== undefined) {
        result[key] = diff;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  if (typeof current === "number" && typeof defaults === "number") {
    return Math.abs(current - defaults) < 1e-12 ? undefined : current;
  }

  return current === defaults ? undefined : current;
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (!isRecord(target) || !isRecord(source)) {
    return source;
  }

  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    result[key] = deepMerge(result[key], value);
  }
  return result;
}

export function mergeWithDefaults(
  defaults: FactorioServerSpec,
  overrides: FactorioServerSpec,
): FactorioServerSpec {
  return deepMerge(
    structuredClone(defaults),
    overrides,
  ) as FactorioServerSpec;
}
