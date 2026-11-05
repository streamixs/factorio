"use client";

import {
  findCondition,
  type FactorioServer,
  type ServerConnection,
  type ServerUsage,
  type ServiceType,
} from "@factorio/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createServer,
  deleteServer,
  getServerConnection,
  getServerUsage,
  listServers,
  startServer,
  stopServer,
} from "@/lib/api";
import { serverStatusBadge } from "@/lib/server-status";
import {
  formatBytes,
  formatCpu,
  primaryGameAddress,
} from "@/lib/server-connection";

const SERVICE_TYPES: ServiceType[] = ["ClusterIP", "NodePort", "LoadBalancer"];
const SERVICE_OPTIONS = SERVICE_TYPES.map((type) => ({
  value: type,
  label: type,
}));

interface ServerDetails {
  connection: ServerConnection | null;
  usage: ServerUsage | null;
}

export default function Home() {
  const router = useRouter();
  const [servers, setServers] = useState<FactorioServer[]>([]);
  const [details, setDetails] = useState<Record<string, ServerDetails>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [version, setVersion] = useState("2.1.24");
  const [maxPlayers, setMaxPlayers] = useState("8");
  const [seed, setSeed] = useState("");
  const [storageSize, setStorageSize] = useState("10Gi");
  const [serviceType, setServiceType] = useState<ServiceType>("ClusterIP");
  const [gamePassword, setGamePassword] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const list = await listServers();
      setServers(list);

      const entries = await Promise.all(
        list.map(async (server) => {
          const [connection, usage] = await Promise.all([
            getServerConnection(server.metadata.name).catch(() => null),
            getServerUsage(server.metadata.name).catch(() => null),
          ]);
          return [server.metadata.name, { connection, usage }] as const;
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();

    const interval = setInterval(() => {
      void refresh();
    }, 30000);

    return () => clearInterval(interval);
  }, [refresh]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const created = await createServer({
        name: name.trim(),
        version: version.trim() === "" ? undefined : version.trim(),
        server: {
          identity: {
            name: displayName.trim() === "" ? name.trim() : displayName.trim(),
          },
          access: {
            maxPlayers:
              maxPlayers.trim() === "" ? undefined : Number(maxPlayers),
          },
        },
        mapGenSettings:
          seed.trim() === "" ? undefined : { seed: Number(seed) },
        storage: { size: storageSize.trim() === "" ? undefined : storageSize },
        service: { type: serviceType },
        credentials:
          gamePassword === "" ? undefined : { gamePassword },
      });

      toast.success("Serveur créé");
      router.push(`/servers/${encodeURIComponent(created.metadata.name)}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible de créer le serveur";
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

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
              {servers.map((server) => {
                const badge = serverStatusBadge(server);
                const suspended = server.spec.suspended === true;
                const degraded = findCondition(server, "Degraded");
                const storage = server.spec.storage?.size ?? "10Gi";
                const service = server.spec.service?.type ?? "ClusterIP";
                const players = server.spec.server?.access?.maxPlayers ?? 0;
                const display =
                  server.spec.server?.identity?.name ?? server.metadata.name;
                const busy = pending === server.metadata.name;
                const serverDetails = details[server.metadata.name];
                const address = primaryGameAddress(
                  serverDetails?.connection,
                );
                const usage = serverDetails?.usage;
                const usageText = suspended
                  ? "Arrêté"
                  : usage?.available === true
                    ? `${formatCpu(usage.cpuMillicores)} · ${formatBytes(usage.memoryBytes)}`
                    : "—";

                return (
                  <Card key={server.metadata.name}>
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
                      <span className="text-muted-foreground">
                        Joueurs max
                      </span>
                      <span>{players === 0 ? "Illimité" : players}</span>
                      <span className="text-muted-foreground">Stockage</span>
                      <span>{storage}</span>
                      <span className="text-muted-foreground">Service</span>
                      <span>{service}</span>
                      <span className="text-muted-foreground">Créé</span>
                      <span>
                        {server.metadata.creationTimestamp === undefined
                          ? "—"
                          : new Date(
                              server.metadata.creationTimestamp,
                            ).toLocaleDateString()}
                      </span>
                      <Separator className="col-span-2" />
                      <div className="col-span-2 flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
                        <span className="text-xs text-muted-foreground">
                          Connexion
                        </span>
                        <span className="text-right font-mono text-xs break-all">
                          {address ?? "—"}
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          Charge
                        </span>
                        <span className="text-xs">{usageText}</span>
                      </div>
                      {degraded?.status === "True" &&
                        degraded.message !== undefined && (
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
                        onClick={() => void handleToggle(server)}
                        disabled={busy}
                      >
                        {suspended ? "Démarrer" : "Arrêter"}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          void handleDelete(server.metadata.name)
                        }
                        disabled={busy}
                      >
                        Supprimer
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Nouveau serveur</CardTitle>
            <CardDescription>
              La ressource est créée dans le namespace configuré sur l&apos;API.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => void handleCreate(event)}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-name">Nom</Label>
                <Input
                  id="create-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="my-factorio"
                  pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?"
                  maxLength={63}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="create-display-name">Nom affiché</Label>
                <Input
                  id="create-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="My Factorio Server"
                  maxLength={64}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="create-version">Version</Label>
                  <Input
                    id="create-version"
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                    placeholder="2.1.24"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="create-max-players">Joueurs max</Label>
                  <Input
                    id="create-max-players"
                    type="number"
                    min={0}
                    value={maxPlayers}
                    onChange={(event) => setMaxPlayers(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="create-seed">Seed</Label>
                  <Input
                    id="create-seed"
                    type="number"
                    min={0}
                    max={4294967295}
                    value={seed}
                    onChange={(event) => setSeed(event.target.value)}
                    placeholder="aléatoire"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="create-storage">Stockage</Label>
                  <Input
                    id="create-storage"
                    value={storageSize}
                    onChange={(event) => setStorageSize(event.target.value)}
                    placeholder="10Gi"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="create-service">Type de Service</Label>
                <Select
                  items={SERVICE_OPTIONS}
                  value={serviceType}
                  onValueChange={(value) => setServiceType(value as ServiceType)}
                >
                  <SelectTrigger id="create-service">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="create-password">
                  Mot de passe de partie
                </Label>
                <Input
                  id="create-password"
                  type="password"
                  value={gamePassword}
                  onChange={(event) => setGamePassword(event.target.value)}
                  placeholder="Optionnel"
                />
              </div>

              <Button type="submit" disabled={creating}>
                {creating ? "Création…" : "Créer le serveur"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
