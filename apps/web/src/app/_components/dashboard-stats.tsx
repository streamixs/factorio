import {
  conditionStatus,
  type FactorioServer,
  type ServerUsage,
} from "@factorio/shared";
import type { LucideIcon } from "lucide-react";
import { Activity, Server, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { cn } from "cn";

import { formatBytes, formatCpu } from "@/lib/server-connection";
import { serverIsOnline } from "@/lib/server-status";

import type { ServerDetails } from "./server-card";

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  detail,
  alert = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  detail: string;
  alert?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/80 bg-card/80 p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {unit !== undefined && (
          <span className="text-[11px] text-muted-foreground">{unit}</span>
        )}
      </div>
      <p
        className={cn(
          "mt-1 text-[11px] text-muted-foreground",
          alert && "text-destructive",
        )}
      >
        {detail}
      </p>
      <div
        className="pointer-events-none absolute -right-7 -top-8 size-24 rounded-full bg-primary/5 blur-2xl"
        aria-hidden
      />
    </div>
  );
}

export function DashboardStats({
  servers,
  details,
}: {
  servers: FactorioServer[];
  details: Record<string, ServerDetails>;
}) {
  const online = servers.filter(serverIsOnline).length;
  const stopped = servers.filter((server) => server.spec.suspended === true)
    .length;
  const places = servers.reduce(
    (sum, server) => sum + (server.spec.server?.access?.maxPlayers ?? 0),
    0,
  );
  const degraded = servers.filter(
    (server) => conditionStatus(server, "Degraded") === "True",
  ).length;

  const usages = Object.values(details)
    .map((entry) => entry.usage)
    .filter((usage): usage is ServerUsage => usage?.available === true);
  const cpu = usages.reduce((sum, usage) => sum + usage.cpuMillicores, 0);
  const memory = usages.reduce((sum, usage) => sum + usage.memoryBytes, 0);

  const onlinePlayers = Object.values(details).reduce(
    (sum, entry) =>
      sum +
      (entry.players?.available === true ? entry.players.players.length : 0),
    0,
  );
  const playersAvailable = Object.values(details).some(
    (entry) => entry.players?.available === true,
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon={Server}
        label="Serveurs"
        value={String(servers.length)}
        unit="dans le cluster"
        detail={`${online} en ligne · ${stopped} arrêté${stopped > 1 ? "s" : ""}`}
      />
      <StatCard
        icon={Users}
        label="Joueurs"
        value={playersAvailable ? String(onlinePlayers) : "—"}
        unit={playersAvailable ? "en ligne" : undefined}
        detail={
          places > 0
            ? `${places} place${places > 1 ? "s" : ""} configurée${places > 1 ? "s" : ""}`
            : `${servers.length} serveur${servers.length > 1 ? "s" : ""}`
        }
      />
      <StatCard
        icon={Activity}
        label="Charge"
        value={formatCpu(cpu)}
        unit="CPU"
        detail={`${formatBytes(memory)} de mémoire utilisée`}
      />
      <StatCard
        icon={degraded > 0 ? ShieldAlert : ShieldCheck}
        label="Alertes"
        value={String(degraded)}
        unit={degraded > 1 ? "serveurs dégradés" : "serveur dégradé"}
        detail={
          degraded === 0
            ? "Tout est nominal"
            : `${degraded} serveur${degraded > 1 ? "s" : ""} à vérifier`
        }
        alert={degraded > 0}
      />
    </div>
  );
}
