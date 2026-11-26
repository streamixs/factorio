import { conditionStatus, type FactorioServer } from "@factorio/shared";

export type ServerStatusTone = "emerald" | "amber" | "red" | "zinc";

export interface ServerStatusBadge {
  label: string;
  className: string;
  tone: ServerStatusTone;
}

export function serverStatusBadge(server: FactorioServer): ServerStatusBadge {
  if (server.spec.suspended === true) {
    return {
      label: "Arrêté",
      className:
        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
      tone: "zinc",
    };
  }

  if (conditionStatus(server, "Degraded") === "True") {
    return {
      label: "Dégradé",
      className:
        "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
      tone: "red",
    };
  }

  if (conditionStatus(server, "Available") === "True") {
    return {
      label: "En ligne",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
      tone: "emerald",
    };
  }

  if (conditionStatus(server, "Progressing") === "True") {
    return {
      label: "Démarrage",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      tone: "amber",
    };
  }

  return {
    label: "Inconnu",
    className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
    tone: "zinc",
  };
}

/** True when the server is running and reports the Available condition. */
export function serverIsOnline(server: FactorioServer): boolean {
  return (
    server.spec.suspended !== true &&
    conditionStatus(server, "Available") === "True"
  );
}
