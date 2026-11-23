"use client";

import {
  findCondition,
  type FactorioServer,
  type ServerConnection,
  type ServerUsage,
} from "@factorio/shared";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { serverStatusBadge } from "@/lib/server-status";
import {
  formatBytes,
  formatCpu,
  primaryGameAddress,
} from "@/lib/server-connection";

export interface ServerDetails {
  connection: ServerConnection | null;
  usage: ServerUsage | null;
}

export function ServerCard({
  server,
  details,
  pending,
  onToggle,
  onDelete,
}: {
  server: FactorioServer;
  details?: ServerDetails;
  pending: boolean;
  onToggle: (server: FactorioServer) => void;
  onDelete: (name: string) => void;
}) {
  const badge = serverStatusBadge(server);
  const suspended = server.spec.suspended === true;
  const degraded = findCondition(server, "Degraded");
  const storage = server.spec.storage?.size ?? "10Gi";
  const service = server.spec.service?.type ?? "ClusterIP";
  const players = server.spec.server?.access?.maxPlayers ?? 0;
  const display =
    server.spec.server?.identity?.name ?? server.metadata.name;
  const address = primaryGameAddress(details?.connection);
  const usage = details?.usage;
  const usageText = suspended
    ? "Arrêté"
    : usage?.available === true
      ? `${formatCpu(usage.cpuMillicores)} · ${formatBytes(usage.memoryBytes)}`
      : "—";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate font-mono text-base">
              <Link
                href={`/servers/${encodeURIComponent(server.metadata.name)}`}
                className="hover:underline"
              >
                {server.metadata.name}
              </Link>
            </CardTitle>
            <CardDescription className="truncate">
              {display} · v{server.spec.version ?? "unknown"}
            </CardDescription>
          </div>
          <Badge variant="outline" className={badge.className}>
            {badge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <span className="text-muted-foreground">Joueurs max</span>
        <span>{players === 0 ? "Illimité" : players}</span>
        <span className="text-muted-foreground">Stockage</span>
        <span>{storage}</span>
        <span className="text-muted-foreground">Service</span>
        <span>{service}</span>
        <span className="text-muted-foreground">Créé</span>
        <span>
          {server.metadata.creationTimestamp === undefined
            ? "—"
            : new Date(server.metadata.creationTimestamp).toLocaleDateString()}
        </span>
        <Separator className="col-span-2" />
        <div className="col-span-2 flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-muted-foreground">Connexion</span>
          <span className="text-right font-mono text-xs break-all">
            {address ?? "—"}
          </span>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Charge</span>
          <span className="text-xs">{usageText}</span>
        </div>
        {degraded?.status === "True" && degraded.message !== undefined && (
          <>
            <Separator className="col-span-2" />
            <p className="col-span-2 text-xs text-destructive">
              {degraded.message}
            </p>
          </>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onToggle(server)}
          disabled={pending}
        >
          {suspended ? "Démarrer" : "Arrêter"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => onDelete(server.metadata.name)}
          disabled={pending}
        >
          Supprimer
        </Button>
      </CardFooter>
    </Card>
  );
}
