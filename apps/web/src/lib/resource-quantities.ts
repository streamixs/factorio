import {
  quantityPattern,
  type ResourcesSettings,
} from "@factorio/shared";

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

export type ResourceField = keyof ResourcesSettings;

export interface ResourceIssue {
  field: ResourceField;
  message: string;
}

const RESOURCE_LABELS: Record<ResourceField, string> = {
  cpuRequest: "CPU request",
  cpuLimit: "CPU limit",
  memoryRequest: "Mémoire request",
  memoryLimit: "Mémoire limit",
};

const RESOURCE_FIELDS: ResourceField[] = [
  "cpuRequest",
  "cpuLimit",
  "memoryRequest",
  "memoryLimit",
];

/**
 * Validates Kubernetes quantities and checks that each limit is greater than
 * or equal to its request. Returns the first issue, or undefined.
 */
export function validateResourceQuantities(
  resources: ResourcesSettings | undefined,
): ResourceIssue | undefined {
  if (resources === undefined) {
    return undefined;
  }

  for (const field of RESOURCE_FIELDS) {
    const value = resources[field]?.trim();
    if (value !== undefined && value !== "" && !quantityPattern.test(value)) {
      return {
        field,
        message: `${RESOURCE_LABELS[field]} : quantité Kubernetes invalide (ex. 500m, 2, 1Gi).`,
      };
    }
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
      field: "cpuLimit",
      message:
        "La limite CPU doit être supérieure ou égale à la CPU request.",
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
      field: "memoryLimit",
      message:
        "La limite mémoire doit être supérieure ou égale à la mémoire request.",
    };
  }

  return undefined;
}
