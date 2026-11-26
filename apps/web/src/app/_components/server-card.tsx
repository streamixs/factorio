"use client";

import type {
  FactorioServer,
  ServerConnection,
  ServerOperation,
  ServerPlayers,
  ServerUsage,
} from "@factorio/shared";
import { ArrowRight, Copy, Loader2, Play, Square } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { operationLabel } from "@/lib/operations";
import {
  formatBytes,
  formatCpu,
  gameAddressIsInternal,
  primaryGameAddress,
} from "@/lib/server-connection";
import { serverStatusBadge, type ServerStatusTone } from "@/lib/server-status";
import {
  parseCpu,
  parseMemory,
} from "@/lib/resource-quantities";

export interface ServerDetails {
  connection: ServerConnection | null;
  usage: ServerUsage | null;
  players?: ServerPlayers | null;
  operation?: ServerOperation;
}

const DOT_CLASS: Record<ServerStatusTone, string> = {
  emerald: "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]",
  amber: "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.12)]",
  red: "bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.12)]",
  zinc: "bg-zinc-400 shadow-[0_0_0_3px_rgba(161,161,170,0.12)]",
};

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="mt-0.5 block truncate text-xs font-semibold">
        {value}
      </span>
    </div>
  );
}

function UsageBar({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-[9px] font-medium text-muted-foreground">
        {label}
      </span>
      <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        {percent !== undefined && (
          <span
            className={cn(
              "block h-full rounded-full",
              label === "CPU" ? "bg-primary" : "bg-chart-2",
            )}
            style={{ width: `${clampPercent(percent)}%` }}
          />
        )}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[9px] text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

export function ServerCard({
  server,
  details,
  pending,
  onToggle,
}: {
  server: FactorioServer;
  details?: ServerDetails;
  pending: boolean;
  onToggle: (server: FactorioServer) => void;
}) {
  const status = serverStatusBadge(server);
  const suspended = server.spec.suspended === true;
  const operation = details?.operation;
  const operationActive = operation !== undefined;
  const usage = details?.usage;
  const usageAvailable = usage?.available === true;
  const onlinePlayers =
    details?.players?.available === true
      ? details.players.players.length
      : undefined;

  const display =
    server.spec.server?.identity?.name ?? server.metadata.name;
  const maxPlayers = server.spec.server?.access?.maxPlayers ?? 0;
  const service = server.spec.service?.type ?? "ClusterIP";
  const address = primaryGameAddress(details?.connection);
  const internal = gameAddressIsInternal(details?.connection);

  const cpuLimit = server.spec.resources?.cpuLimit
    ? parseCpu(server.spec.resources.cpuLimit)
    : undefined;
  const memoryLimit = server.spec.resources?.memoryLimit
    ? parseMemory(server.spec.resources.memoryLimit)
    : undefined;
  const cpuPercent =
    usageAvailable && usage !== undefined && cpuLimit !== undefined
      ? (usage.cpuMillicores / cpuLimit) * 100
      : undefined;
  const memoryPercent =
    usageAvailable && usage !== undefined && memoryLimit !== undefined
      ? (usage.memoryBytes / memoryLimit) * 100
      : undefined;

  async function copyAddress() {
    if (address === undefined) {
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Adresse copiée");
    } catch {
      toast.error("Impossible de copier l'adresse");
    }
  }

  return (
    <Card className="group gap-0 transition-all hover:ring-primary/25">
      <CardHeader className="gap-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn("size-2 shrink-0 rounded-full", DOT_CLASS[status.tone])}
                aria-hidden
              />
              <CardTitle className="truncate font-mono text-base">
                <Link
                  href={`/servers/view?name=${encodeURIComponent(server.metadata.name)}`}
                  className="transition-colors hover:text-primary"
                >
                  {server.metadata.name}
                </Link>
              </CardTitle>
              <Badge
                variant="outline"
                className={cn("shrink-0", status.className)}
              >
                {status.label}
              </Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {display} · namespace {server.metadata.namespace ?? "default"} · v
              {server.spec.version ?? "inconnue"}
            </p>
          </div>

          {operation !== undefined && (
            <Badge
              variant="secondary"
              className="max-w-[130px] shrink-0 gap-1"
              title={operationLabel(operation)}
            >
              {operationActive && (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              )}
              <span className="truncate">
                {operation.type === "Import" ? "Import" : "Restauration"}
              </span>
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        <div className="grid grid-cols-4 gap-2">
          <Metric
            label="Joueurs"
            value={
              onlinePlayers === undefined
                ? "—"
                : maxPlayers === 0
                  ? String(onlinePlayers)
                  : `${onlinePlayers}/${maxPlayers}`
            }
          />
          <Metric
            label="CPU"
            value={usageAvailable ? formatCpu(usage.cpuMillicores) : "—"}
          />
          <Metric
            label="RAM"
            value={usageAvailable ? formatBytes(usage.memoryBytes) : "—"}
          />
          <Metric label="Service" value={service} />
        </div>

        <div className="space-y-1.5">
          <UsageBar
            label="CPU"
            value={
              usageAvailable && usage !== undefined
                ? formatCpu(usage.cpuMillicores)
                : "—"
            }
            percent={cpuPercent}
          />
          <UsageBar
            label="RAM"
            value={
              usageAvailable && usage !== undefined
                ? formatBytes(usage.memoryBytes)
                : "—"
            }
            percent={memoryPercent}
          />
        </div>

        <div className="flex min-w-0 items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
            {address ?? "—"}
          </span>
          {address !== undefined && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => void copyAddress()}
              aria-label={`Copier l'adresse de ${server.metadata.name}`}
            >
              <Copy className="size-3" />
            </Button>
          )}
          <Badge variant="outline" className="shrink-0">
            {service}
          </Badge>
          {internal && (
            <Badge variant="secondary" className="shrink-0">
              Interne
            </Badge>
          )}
        </div>
      </CardContent>

      <CardFooter className="justify-between gap-2 border-t bg-muted/30 px-4 py-2.5">
        <span className="hidden text-[10px] text-muted-foreground sm:inline">
          Créé le {formatDate(server.metadata.creationTimestamp)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onToggle(server)}
            disabled={pending || operationActive}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : suspended ? (
              <Play className="size-3.5" aria-hidden />
            ) : (
              <Square className="size-3.5" aria-hidden />
            )}
            {suspended ? "Démarrer" : "Arrêter"}
          </Button>
          <Link
            href={`/servers/view?name=${encodeURIComponent(server.metadata.name)}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "gap-1",
            )}
          >
            Ouvrir
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
