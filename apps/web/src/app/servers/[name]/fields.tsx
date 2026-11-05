"use client";

import {
  Controller,
  useFormContext,
  type FieldPath,
} from "react-hook-form";

import type { FormValues } from "./settings-form";

export const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800";

const labelClass =
  "flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300";

const hintClass = "text-xs font-normal text-zinc-500 dark:text-zinc-400";
const errorClass = "text-xs font-normal text-red-600 dark:text-red-400";

export function toOptionalNumber(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function errorAt(errors: unknown, path: string): string | undefined {
  let current: unknown = errors;

  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (
    current !== null &&
    typeof current === "object" &&
    "message" in current &&
    typeof (current as { message?: unknown }).message === "string"
  ) {
    return (current as { message: string }).message;
  }

  return undefined;
}

export function TextField({
  name,
  label,
  hint,
  placeholder,
  type = "text",
  emptyAsUndefined = false,
}: {
  name: FieldPath<FormValues>;
  label: string;
  hint?: string;
  placeholder?: string;
  type?: "text" | "password" | "url";
  emptyAsUndefined?: boolean;
}) {
  const { register, formState } = useFormContext<FormValues>();
  const error = errorAt(formState.errors, name);
  const options = emptyAsUndefined
    ? { setValueAs: (value: unknown) => (value === "" ? undefined : value) }
    : undefined;

  return (
    <label className={labelClass}>
      <span>{label}</span>
      <input
        type={type}
        className={inputClass}
        placeholder={placeholder}
        {...register(name, options)}
      />
      {hint !== undefined && <span className={hintClass}>{hint}</span>}
      {error !== undefined && <span className={errorClass}>{error}</span>}
    </label>
  );
}

export function NumberField({
  name,
  label,
  hint,
  placeholder,
  step = "1",
}: {
  name: FieldPath<FormValues>;
  label: string;
  hint?: string;
  placeholder?: string;
  step?: string;
}) {
  const { register, formState } = useFormContext<FormValues>();
  const error = errorAt(formState.errors, name);

  return (
    <label className={labelClass}>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        className={inputClass}
        placeholder={placeholder}
        {...register(name, { setValueAs: toOptionalNumber })}
      />
      {hint !== undefined && <span className={hintClass}>{hint}</span>}
      {error !== undefined && <span className={errorClass}>{error}</span>}
    </label>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
}: {
  name: FieldPath<FormValues>;
  label: string;
  hint?: string;
}) {
  const { register } = useFormContext<FormValues>();

  return (
    <label className="flex items-start gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-950"
        {...register(name)}
      />
      <span>
        {label}
        {hint !== undefined && (
          <span className={`${hintClass} block`}>{hint}</span>
        )}
      </span>
    </label>
  );
}

export function SelectField({
  name,
  label,
  options,
  hint,
  numeric = false,
}: {
  name: FieldPath<FormValues>;
  label: string;
  options: Array<{ value: string; label: string }>;
  hint?: string;
  numeric?: boolean;
}) {
  const { register, formState } = useFormContext<FormValues>();
  const error = errorAt(formState.errors, name);

  return (
    <label className={labelClass}>
      <span>{label}</span>
      <select
        className={inputClass}
        {...register(name, {
          setValueAs: (value: unknown) => {
            if (value === "") {
              return undefined;
            }
            return numeric ? Number(value) : value;
          },
        })}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint !== undefined && <span className={hintClass}>{hint}</span>}
      {error !== undefined && <span className={errorClass}>{error}</span>}
    </label>
  );
}

export function TextAreaField({
  name,
  label,
  hint,
  rows = 3,
}: {
  name: FieldPath<FormValues>;
  label: string;
  hint?: string;
  rows?: number;
}) {
  const { register, formState } = useFormContext<FormValues>();
  const error = errorAt(formState.errors, name);

  return (
    <label className={labelClass}>
      <span>{label}</span>
      <textarea
        className={inputClass}
        rows={rows}
        {...register(name)}
      />
      {hint !== undefined && <span className={hintClass}>{hint}</span>}
      {error !== undefined && <span className={errorClass}>{error}</span>}
    </label>
  );
}

export function TagsField({
  name,
  label,
}: {
  name: FieldPath<FormValues>;
  label: string;
}) {
  const { control, formState } = useFormContext<FormValues>();
  const error = errorAt(formState.errors, name);

  return (
    <label className={labelClass}>
      <span>{label}</span>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <input
            className={inputClass}
            value={Array.isArray(field.value) ? field.value.join(", ") : ""}
            onChange={(event) =>
              field.onChange(
                event.target.value
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter((tag) => tag !== ""),
              )
            }
            placeholder="pvp, modded"
          />
        )}
      />
      <span className={hintClass}>Séparés par des virgules</span>
      {error !== undefined && <span className={errorClass}>{error}</span>}
    </label>
  );
}

export function SecretField({
  valueName,
  clearName,
  label,
  hint,
  isSet,
}: {
  valueName: FieldPath<FormValues>;
  clearName: FieldPath<FormValues>;
  label: string;
  hint?: string;
  isSet: boolean;
}) {
  const { register, formState } = useFormContext<FormValues>();
  const error = errorAt(formState.errors, valueName);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="password"
          className={inputClass}
          placeholder={
            isSet ? "Laisser vide pour conserver" : "Non défini"
          }
          {...register(valueName)}
        />
        {isSet && (
          <label className="flex shrink-0 items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" {...register(clearName)} />
            Effacer
          </label>
        )}
      </div>
      {hint !== undefined && <span className={hintClass}>{hint}</span>}
      {error !== undefined && <span className={errorClass}>{error}</span>}
    </div>
  );
}

export function JsonEditor({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
}) {
  return (
    <label className={labelClass}>
      <span>{label}</span>
      <textarea
        className={`${inputClass} font-mono text-xs`}
        rows={10}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
      {hint !== undefined && <span className={hintClass}>{hint}</span>}
      {error !== undefined && <span className={errorClass}>{error}</span>}
    </label>
  );
}
