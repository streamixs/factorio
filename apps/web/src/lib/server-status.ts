import { conditionStatus, type FactorioServer } from "@factorio/shared";

export function serverStatusBadge(server: FactorioServer): {
  label: string;
  className: string;
} {
  if (server.spec.suspended === true) {
    return {
      label: "Stopped",
      className:
        "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    };
  }

  if (conditionStatus(server, "Degraded") === "True") {
    return {
      label: "Degraded",
      className:
        "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    };
  }

  if (conditionStatus(server, "Available") === "True") {
    return {
      label: "Available",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    };
  }

  if (conditionStatus(server, "Progressing") === "True") {
    return {
      label: "Starting",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    };
  }

  return {
    label: "Unknown",
    className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  };
}
