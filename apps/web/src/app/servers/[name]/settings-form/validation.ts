import { factorioServerSpecSchema, type FactorioServerSpec } from "@factorio/shared";
import { z } from "zod";

export function parseCpu(value: string): number | undefined {
  const match = /^([0-9.]+)(m|u|n)?$/.exec(value.trim());
  if (match === null) {
    return undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return undefined;
  }
  switch (match[2]) {
    case "n":
      return amount / 1_000_000;
    case "u":
      return amount / 1_000;
    case "m":
      return amount;
    default:
      return amount * 1000;
  }
}

export function parseMemory(value: string): number | undefined {
  const match = /^([0-9.]+)(Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)?$/.exec(
    value.trim(),
  );
  if (match === null) {
    return undefined;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return undefined;
  }
  const units: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
    E: 1e18,
  };
  return match[2] === undefined ? amount : amount * (units[match[2]] ?? 1);
}

function resourceLimitIssue(
  spec: FactorioServerSpec,
): { path: string; message: string } | undefined {
  const resources = spec.resources;
  if (resources === undefined) {
    return undefined;
  }

  const cpuRequest = resources.cpuRequest
    ? parseCpu(resources.cpuRequest)
    : undefined;
  const cpuLimit = resources.cpuLimit
    ? parseCpu(resources.cpuLimit)
    : undefined;
  if (
    cpuRequest !== undefined &&
    cpuLimit !== undefined &&
    cpuLimit < cpuRequest
  ) {
    return {
      path: "spec.resources.cpuLimit",
      message: "La limite CPU doit être supérieure ou égale à la CPU request.",
    };
  }

  const memoryRequest = resources.memoryRequest
    ? parseMemory(resources.memoryRequest)
    : undefined;
  const memoryLimit = resources.memoryLimit
    ? parseMemory(resources.memoryLimit)
    : undefined;
  if (
    memoryRequest !== undefined &&
    memoryLimit !== undefined &&
    memoryLimit < memoryRequest
  ) {
    return {
      path: "spec.resources.memoryLimit",
      message:
        "La limite mémoire doit être supérieure ou égale à la mémoire request.",
    };
  }

  return undefined;
}

export function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export const formSchema = z.object({
  spec: factorioServerSpecSchema,
  credentials: z.strictObject({
    gamePassword: z.string(),
    password: z.string(),
    token: z.string(),
    clearGamePassword: z.boolean(),
    clearPassword: z.boolean(),
    clearToken: z.boolean(),
  }),
}).superRefine((values, ctx) => {
  const issue = resourceLimitIssue(values.spec);
  if (issue !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: issue.path.split("."),
      message: issue.message,
    });
  }
});
