import type { FactorioServer, ServerOperation } from "@factorio/shared";
import { conditionStatus } from "@factorio/shared";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format";
import { operationLabel } from "@/lib/operations";
import { serverIsOnline } from "@/lib/server-status";

import type { ServerDetails } from "./server-card";

function OperationIcon({ operation }: { operation: ServerOperation }) {
  if (operation.type === "Import") {
    return <Upload className="size-3.5" aria-hidden />;
  }
  return <Archive className="size-3.5" aria-hidden />;
}

function PhaseBadge({ operation }: { operation: ServerOperation }) {
  if (operation.phase === "Failed") {
    return <Badge variant="destructive">Échouée</Badge>;
  }
  if (operation.phase === "Completed") {
    return (
      <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">
        Terminée
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-amber-700 dark:text-amber-400">
      En cours
    </Badge>
  );
}

export function RecentOperations({
  operations,
}: {
  operations: Array<{ server: string; operation: ServerOperation }>;
}) {
  return (
    <Card className="h-full gap-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-primary" aria-hidden />
          Activité récente
        </h2>
        <span className="text-[10px] text-muted-foreground">
          tous les serveurs
        </span>
      </div>
      <div className="p-4">
        {operations.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Aucune opération récente.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border/70">
            {operations.map(({ server, operation }) => (
              <Link
                key={`${server}-${operation.name}`}
                href={`/servers/view?name=${encodeURIComponent(server)}`}
                className="flex items-start gap-3 py-3 transition-colors first:pt-0 last:pb-0 hover:text-primary"
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                  <OperationIcon operation={operation} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {operationLabel(operation)}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {server}
                    {operation.saveFile !== undefined
                      ? ` · ${operation.saveFile}`
                      : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <PhaseBadge operation={operation} />
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {formatRelativeTime(operation.createdAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function HealthRow({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "emerald" | "amber" | "red" | "muted";
}) {
  const color = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];

  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className={cn("size-3.5 shrink-0", color)} aria-hidden />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

export function ClusterHealth({
  servers,
  details,
}: {
  servers: FactorioServer[];
  details: Record<string, ServerDetails>;
}) {
  const online = servers.filter(serverIsOnline).length;
  const stopped = servers.filter((server) => server.spec.suspended === true)
    .length;
  const degraded = servers.filter(
    (server) => conditionStatus(server, "Degraded") === "True",
  ).length;
  const active = Object.values(details).filter(
    (entry) => entry.operation !== undefined,
  ).length;
  const nominal = degraded === 0;

  return (
    <Card className="h-full gap-0">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          État du cluster
        </h2>
        <Badge variant={nominal ? "secondary" : "destructive"}>
          {nominal ? "Nominal" : "Attention"}
        </Badge>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <HealthRow
          icon={CheckCircle2}
          label={`${online} serveur${online > 1 ? "s" : ""} en ligne`}
          tone="emerald"
        />
        <HealthRow
          icon={Clock}
          label={`${stopped} serveur${stopped > 1 ? "s" : ""} arrêté${stopped > 1 ? "s" : ""}`}
          tone="muted"
        />
        <HealthRow
          icon={degraded > 0 ? AlertTriangle : CheckCircle2}
          label={`${degraded} serveur${degraded > 1 ? "s" : ""} dégradé${degraded > 1 ? "s" : ""}`}
          tone={degraded > 0 ? "red" : "muted"}
        />
        <HealthRow
          icon={Activity}
          label={`${active} opération${active > 1 ? "s" : ""} en cours`}
          tone={active > 0 ? "amber" : "muted"}
        />
      </div>
    </Card>
  );
}
