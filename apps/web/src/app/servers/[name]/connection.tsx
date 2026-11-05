"use client";

import type {
  ServerConnection,
  ServerUsage,
} from "@factorio/shared";
import { Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerConnection, getServerUsage } from "@/lib/api";
import {
  formatBytes,
  formatCpu,
  gamePort,
  primaryGameAddress,
} from "@/lib/server-connection";

export function ConnectionPanel({
  name,
  suspended,
}: {
  name: string;
  suspended: boolean;
}) {
  const [connection, setConnection] = useState<ServerConnection | null>(null);
  const [usage, setUsage] = useState<ServerUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [nextConnection, nextUsage] = await Promise.all([
        getServerConnection(name),
        getServerUsage(name),
      ]);
      setConnection(nextConnection);
      setUsage(nextUsage);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de charger la connexion",
      );
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    const interval = setInterval(() => {
      void load();
    }, 10000);

    return () => clearInterval(interval);
  }, [load]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Adresse copiée");
    } catch {
      toast.error("Impossible de copier l'adresse");
    }
  }

  const address = primaryGameAddress(connection);
  const port = connection === null ? undefined : gamePort(connection);

  return (
    <div className="flex flex-col gap-4">
      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Connexion
            {connection?.available === true && (
              <Badge variant="secondary">{connection.serviceType}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loading && connection === null ? (
            <Skeleton className="h-32 w-full" />
          ) : connection === null || !connection.available ? (
            <Alert>
              <AlertDescription>
                Le Service n&apos;est pas encore disponible pour ce serveur.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Adresse de jeu
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="font-mono text-lg">
                    {address ?? "—"}
                  </code>
                  {address !== undefined && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void copy(address)}
                      aria-label="Copier l'adresse"
                    >
                      <Copy className="size-4" />
                    </Button>
                  )}
                </div>
                {suspended && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Serveur arrêté : l&apos;adresse reste valide, mais le
                    serveur ne répond pas.
                  </p>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Type de Service</dt>
                <dd>{connection.serviceType}</dd>
                <dt className="text-muted-foreground">Port du jeu</dt>
                <dd>
                  {port === undefined
                    ? "—"
                    : `${port.port}/${port.protocol}`}
                </dd>
                <dt className="text-muted-foreground">NodePort</dt>
                <dd>{port?.nodePort ?? "—"}</dd>
                <dt className="text-muted-foreground">ClusterIP</dt>
                <dd className="font-mono text-xs">
                  {connection.clusterIP ?? "—"}
                </dd>
                <dt className="text-muted-foreground">Nœuds</dt>
                <dd className="font-mono text-xs">
                  {connection.nodeAddresses.length > 0
                    ? connection.nodeAddresses.join(", ")
                    : "—"}
                </dd>
                <dt className="text-muted-foreground">LoadBalancer</dt>
                <dd className="font-mono text-xs">
                  {connection.loadBalancer.length > 0
                    ? connection.loadBalancer.join(", ")
                    : "—"}
                </dd>
              </dl>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Ports</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {connection.ports.map((servicePort) => (
                    <li
                      key={`${servicePort.name ?? servicePort.port}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="font-mono text-xs">
                        {servicePort.name ?? "port"}
                      </span>
                      <span>
                        {servicePort.port}/{servicePort.protocol}
                      </span>
                      {servicePort.nodePort !== undefined && (
                        <Badge variant="outline">
                          NodePort {servicePort.nodePort}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {connection.serviceType === "ClusterIP" && (
                <p className="text-xs text-muted-foreground">
                  Un ClusterIP n&apos;est joignable qu&apos;à l&apos;intérieur du
                  cluster. Utilise un NodePort, un LoadBalancer ou un
                  port-forward.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Charge
            {usage?.available === true && <Badge variant="secondary">Live</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {usage?.available === true ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground uppercase">
                    CPU
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatCpu(usage.cpuMillicores)}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground uppercase">
                    Mémoire
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatBytes(usage.memoryBytes)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col">
                {usage.containers.map((container, index) => (
                  <div key={container.name}>
                    {index > 0 && <Separator />}
                    <div className="flex items-center justify-between gap-4 py-2 text-sm">
                      <span className="font-mono text-xs">{container.name}</span>
                      <span className="text-muted-foreground">
                        {formatCpu(container.cpuMillicores)} ·{" "}
                        {formatBytes(container.memoryBytes)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Rafraîchi toutes les 10 secondes via metrics-server.
              </p>
            </>
          ) : (
            <Alert>
              <AlertDescription>
                Métriques indisponibles : le pod est arrêté ou metrics-server
                n&apos;est pas installé dans le cluster.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
