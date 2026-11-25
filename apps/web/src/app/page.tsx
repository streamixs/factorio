"use client";

import type { FactorioServer } from "@factorio/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteServer,
  getServerConnection,
  getServerOperations,
  getServerUsage,
  getStorageClasses,
  getVersions,
  listServers,
  startServer,
  stopServer,
} from "@/lib/api";
import { activeOperation } from "@/lib/operations";

import { CreateServerForm } from "./_components/create-server-form";
import { ServerCard, type ServerDetails } from "./_components/server-card";

export default function Home() {
  const router = useRouter();
  const [servers, setServers] = useState<FactorioServer[]>([]);
  const [details, setDetails] = useState<Record<string, ServerDetails>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [storageClasses, setStorageClasses] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const list = await listServers();
      setServers(list);

      const entries = await Promise.all(
        list.map(async (server) => {
          const [connection, usage, operations] = await Promise.all([
            getServerConnection(server.metadata.name).catch(() => null),
            getServerUsage(server.metadata.name).catch(() => null),
            getServerOperations(server.metadata.name).catch(() => []),
          ]);
          return [
            server.metadata.name,
            { connection, usage, operation: activeOperation(operations) },
          ] as const;
        }),
      );
      setDetails(Object.fromEntries(entries));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de charger l'API",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    getVersions()
      .then((value) => {
        if (active) {
          setVersions(value);
        }
      })
      .catch(() => {
        // The form falls back to a plain version input.
      });

    getStorageClasses()
      .then((value) => {
        if (active) {
          setStorageClasses(value);
        }
      })
      .catch(() => {
        // The form falls back to a plain StorageClass input.
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();

    const interval = setInterval(() => {
      void refresh();
    }, 30000);

    return () => clearInterval(interval);
  }, [refresh]);

  async function handleToggle(server: FactorioServer) {
    setPending(server.metadata.name);
    setError(null);

    try {
      const suspended = server.spec.suspended === true;
      await (suspended
        ? startServer(server.metadata.name)
        : stopServer(server.metadata.name));
      await refresh();
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

  async function handleDelete(serverName: string) {
    if (
      !window.confirm(
        `Supprimer ${serverName} ? Son volume persistant sera supprimé avec lui.`,
      )
    ) {
      return;
    }

    setPending(serverName);
    setError(null);

    try {
      await deleteServer(serverName);
      await refresh();
      toast.success("Serveur supprimé");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible de supprimer le serveur";
      setError(message);
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Factorio Platform
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gère les serveurs Factorio exécutés dans Kubernetes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          Rafraîchir
        </Button>
      </header>

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Serveurs</h2>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : servers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Aucun serveur pour l&apos;instant. Crée-en un depuis le
                formulaire.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {servers.map((server) => (
                <ServerCard
                  key={server.metadata.name}
                  server={server}
                  details={details[server.metadata.name]}
                  pending={pending === server.metadata.name}
                  onToggle={(value) => void handleToggle(value)}
                  onDelete={(name) => void handleDelete(name)}
                />
              ))}
            </div>
          )}
        </section>

        <CreateServerForm
          versions={versions}
          storageClasses={storageClasses}
          onCreated={(created) => {
            toast.success("Serveur créé");
            router.push(
              `/servers/${encodeURIComponent(created.metadata.name)}`,
            );
          }}
          onError={setError}
        />
      </div>
    </main>
  );
}
