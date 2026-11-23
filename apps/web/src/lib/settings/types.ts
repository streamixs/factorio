import type { FactorioServerSpec } from "@factorio/shared";

import type { JsonSchemaNode } from "../settings-schema";

export type FieldKind =
  | "text"
  | "number"
  | "switch"
  | "select"
  | "textarea"
  | "tags"
  | "quantity"
  | "secret";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldDefinition {
  path: string;
  label: string;
  kind: FieldKind;
  help?: string;
  placeholder?: string;
  step?: string;
  numeric?: boolean;
  emptyAsUndefined?: boolean;
  options?: SelectOption[];
  wide?: boolean;
  clearPath?: string;
  /** Field is fixed once the resource exists (e.g. the data volume). */
  readOnly?: boolean;
  /** Autocomplete values shown in the field's datalist. */
  suggestions?: string[];
  /** OpenAPI schema node resolved from the CRD. */
  schema?: JsonSchemaNode;
  /** Factorio default, used by the "Défaut" option and suggestions. */
  defaultValue?: unknown;
}

export interface FieldGroup {
  title?: string;
  fields: FieldDefinition[];
}

export interface SettingsSection {
  id: string;
  title: string;
  badge?: string;
  description?: string;
  groups: FieldGroup[];
  custom?: "autoplace" | "raw";
}

export interface CatalogOptions {
  versions?: string[];
  storageClasses?: string[];
}

export interface CredentialsFormValues {
  gamePassword: string;
  password: string;
  token: string;
  clearGamePassword: boolean;
  clearPassword: boolean;
  clearToken: boolean;
}

export interface FormValues {
  spec: FactorioServerSpec;
  credentials: CredentialsFormValues;
}
