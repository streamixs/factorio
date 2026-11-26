"use client";

import type {
  FactorioServer,
  ServerOperation,
} from "@factorio/shared";
import { Loader2, RefreshCw, Search, Server } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";
import {
  getServerConnection,
  getServerOperations,
  getServerUsage,
  listServers,
  startServer,
  stopServer,
} from "@/lib/api";
import { activeOperation } from "@/lib/operations";

import { ClusterHealth, RecentOperations } from "./dashboard-activity";
import { DashboardStats } from "./dashboard-stats";
import { ServerCard, type ServerDetails } from "./server-card";

interface OperationEntry {
  server: string;
  operation: ServerOperation;
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-[104px] w-full rounded-xl" />
      ))}
    </div>
  );
}

function ServerGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-[290px] w-full rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed bg-card/60">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="grid size-11 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
          <Server className="size-5" aria-hidden />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Aucun serveur pour l&apos;instant</h3>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Crée ton premier monde Factorio. Tu pourras choisir la version, les
            ressources et le type de Service, puis tout ajuster ensuite.
          </p>
        </div>
        <Link
          href="/servers/new"
          className={cn(buttonVariants({ size: "sm" }), "mt-1")}
        >
          Créer mon premier serveur
        </Link>
      </CardContent>
    </Card>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <Card className="border-dashed bg-card/60">
      <CardContent className="px-6 py-10 text-center text-sm text-muted-foreground">
        Aucun serveur ne correspond à « {query} ».
      </CardContent>
    </Card>
  );
}

export function HomeDashboard() {
  const [servers, setServers] = useState<FactorioServer[]>([]);
  const [details, setDetails] = useState<Record<string, ServerDetails>>({});
  const [operations, setOperations] = useState<OperationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) {
      setRefreshing(true);
    }

    try {
      setError(null);
      const list = await listServers();
      setServers(list);

      const entries = await Promise.all(
        list.map(async (server) => {
          const [connection, usage, serverOperations] = await Promise.all([
            getServerConnection(server.metadata.name).catch(() => null),
            getServerUsage(server.metadata.name).catch(() => null),
            getServerOperations(server.metadata.name).catch(() => []),
          ]);
          return { server, connection, usage, serverOperations };
        }),
      );

      setDetails(
        Object.fromEntries(
          entries.map(({ server, connection, usage, serverOperations }) => [
            server.metadata.name,
            { connection, usage, operation: activeOperation(serverOperations) },
          ]),
        ),
      );
      setOperations(
        entries
          .flatMap(({ server, serverOperations }) =>
            serverOperations.map((operation) => ({
              server: server.metadata.name,
              operation,
            })),
          )
          .sort(
            (left, right) =>
              Date.parse(right.operation.createdAt) -
              Date.parse(left.operation.createdAt),
          )
          .slice(0, 6),
      );
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de charger l'API",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // The first load and the polling both go through the same function.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();

    const interval = setInterval(() => {
      void refresh(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [refresh]);

  const filteredServers = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (search === "") {
      return servers;
    }

    return servers.filter((server) => {
      const display = server.spec.server?.identity?.name ?? "";
      return `${server.metadata.name} ${display}`.toLowerCase().includes(search);
    });
  }, [servers, query]);

  const updatedLabel =
    lastUpdated === null
      ? "Chargement…"
      : `Actualisé à ${lastUpdated.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })}`;

  async function handleToggle(server: FactorioServer) {
    setPending(server.metadata.name);
    setError(null);

    try {
      const suspended = server.spec.suspended === true;
      await (suspended
        ? startServer(server.metadata.name)
        : stopServer(server.metadata.name));
      await refresh(true);
      toast.success(suspended ? "Serveur démarré" : "Serveur arrêté");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible de changer l'état";
      setError(message);
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1460px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-px w-5 bg-primary/70" aria-hidden />
            Console d&apos;exploitation
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Serveurs <span className="text-primary">Factorio</span>
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Pilote tes mondes, surveille la charge et garde les sauvegardes sous
            contrôle.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un serveur…"
              aria-label="Rechercher un serveur"
              className="h-8 w-full pl-8 sm:w-56"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={refreshing || loading}
            className="gap-1.5"
          >
            {refreshing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
            Rafraîchir
          </Button>
        </div>
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <DashboardStats servers={servers} details={details} />
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Serveurs</h2>
          <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            {updatedLabel}
          </span>
        </div>

        {loading ? (
          <ServerGridSkeleton />
        ) : servers.length === 0 ? (
          <EmptyState />
        ) : filteredServers.length === 0 ? (
          <NoResults query={query} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredServers.map((server) => (
              <ServerCard
                key={server.metadata.name}
                server={server}
                details={details[server.metadata.name]}
                pending={pending === server.metadata.name}
                onToggle={(value) => void handleToggle(value)}
              />
            ))}
          </div>
        )}
      </section>

      {!loading && servers.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <RecentOperations operations={operations} />
          <ClusterHealth servers={servers} details={details} />
        </div>
      )}
    </main>
  );
}
