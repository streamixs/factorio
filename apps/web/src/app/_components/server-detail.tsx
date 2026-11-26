"use client";

import {
  findCondition,
  type EffectiveSettings,
  type FactorioServer,
  type ServerOperation,
} from "@factorio/shared";
import {
  ArrowLeft,
  Bell,
  LayoutDashboard,
  Loader2,
  Save,
  ScrollText,
  SlidersHorizontal,
  Terminal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteServer,
  getEffectiveSettings,
  getServer,
  getServerOperations,
  getSettingsSchema,
  getStorageClasses,
  getVersions,
  startServer,
  stopServer,
} from "@/lib/api";
import { activeOperation, operationLabel } from "@/lib/operations";
import { formatDate } from "@/lib/format";
import { serverStatusBadge } from "@/lib/server-status";
import type { SettingsSchema } from "@/lib/settings-schema";

import { DeleteServerConfirmation } from "./delete-server-confirmation";
import { BackupsPanel } from "../servers/[name]/backups";
import { ConnectionPanel } from "../servers/[name]/connection";
import { ConsolePanel } from "../servers/[name]/console";
import { EventsPanel, LogsPanel } from "../servers/[name]/diagnostics";
import { PlayersPanel } from "../servers/[name]/players";
import { SettingsForm } from "../servers/[name]/settings-form";

const VIEWS = [
  { id: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
  { id: "console", label: "Console", icon: Terminal },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "backups", label: "Sauvegardes", icon: Save },
  { id: "config", label: "Configuration", icon: SlidersHorizontal },
  { id: "events", label: "Événements", icon: Bell },
] as const;

export function ServerDetailPage({ name }: { name: string }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ServerDetail name={name} />
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[1460px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-96 w-full" />
    </main>
  );
}

function ServerDetail({ name }: { name: string }) {
  const router = useRouter();

  const [server, setServer] = useState<FactorioServer | null>(null);
  const [settings, setSettings] = useState<EffectiveSettings | null>(null);
  const [operation, setOperation] = useState<ServerOperation | null>(null);
  const [schema, setSchema] = useState<SettingsSchema | null>(null);
  const [versions, setVersions] = useState<string[]>([]);
  const [storageClasses, setStorageClasses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [view, setView] = useState<string>("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const previousActiveOperation = useRef<ServerOperation | null>(null);

  const load = useCallback(async () => {
    if (name === "") {
      setError("Nom de serveur manquant");
      setLoading(false);
      return null;
    }

    try {
      setError(null);
      setWarning(null);

      const current = await getServer(name);
      let effective: EffectiveSettings;

      try {
        effective = await getEffectiveSettings(name);
      } catch {
        effective = { defaults: {}, effective: current.spec };
        setWarning(
          "Les valeurs effectives ne sont pas encore disponibles. L'agent doit être redéployé pour publier les defaults.",
        );
      }

      setServer(current);
      setSettings(effective);
      return { server: current, settings: effective };
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de charger le serveur",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [name]);

  const loadOperations = useCallback(async () => {
    try {
      const operations = await getServerOperations(name);
      const current = activeOperation(operations) ?? null;
      const previous = previousActiveOperation.current;
      previousActiveOperation.current = current;
      setOperation(current);

      if (previous !== null && current === null) {
        const latest = operations[0];
        if (latest?.phase === "Failed") {
          toast.error(latest.message ?? "Opération échouée");
        } else {
          toast.success("Opération terminée");
        }
        await load();
      }
    } catch {
      // Operation polling must not hide the server load errors.
    }
  }, [name, load]);

  const handleOperationStarted = useCallback(() => {
    void loadOperations();
    window.setTimeout(() => {
      void load();
    }, 15000);
  }, [loadOperations, load]);

  useEffect(() => {
    let active = true;

    getSettingsSchema()
      .then((value) => {
        if (active) {
          setSchema(value);
        }
      })
      .catch(() => {
        // The form falls back to the curated catalog without bounds.
      });

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
    // Initial load. refresh() sets state from an async response, not during
    // this render, but the rule only sees the call chain into it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    const interval = setInterval(() => {
      void load();
    }, 30000);

    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOperations();

    const interval = setInterval(() => {
      void loadOperations();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadOperations]);

  async function handleToggle() {
    if (server === null) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const suspended = server.spec.suspended === true;
      const updated = suspended
        ? await startServer(name)
        : await stopServer(name);
      setServer(updated);
      toast.success(suspended ? "Serveur démarré" : "Serveur arrêté");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible de changer l'état";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(keepStorage: boolean) {
    setPending(true);
    setError(null);

    try {
      await deleteServer(name, keepStorage);
      toast.success(
        keepStorage
          ? "Serveur supprimé, données conservées"
          : "Serveur et données supprimés",
      );
      router.push("/");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible de supprimer le serveur";
      setError(message);
      toast.error(message);
      setPending(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-[1460px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <DetailSkeleton />
      </main>
    );
  }

  if (server === null || settings === null) {
    return (
      <main className="mx-auto flex w-full max-w-[1460px] flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          ← Tous les serveurs
        </Link>
        <Alert variant="destructive">
          <AlertDescription>
            {error ?? "Serveur introuvable"}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  const badge = serverStatusBadge(server);
  const suspended = server.spec.suspended === true;
  const operationActive = operation !== null;
  const degraded = findCondition(server, "Degraded");
  const displayName =
    server.spec.server?.identity?.name ?? server.metadata.name;

  return (
    <main className="mx-auto flex w-full max-w-[1460px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              aria-label="Retour aux serveurs"
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            >
              <ArrowLeft className="size-4" />
            </Link>
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {server.metadata.name}
            </h1>
            <Badge variant="outline" className={badge.className}>
              {badge.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {displayName} · namespace {server.metadata.namespace ?? "default"} ·
            v{server.spec.version ?? "inconnue"} · créé le{" "}
            {formatDate(server.metadata.creationTimestamp)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={pending}
          >
            Rafraîchir
          </Button>
          <Button
            type="button"
            variant={suspended ? "default" : "secondary"}
            size="sm"
            onClick={() => void handleToggle()}
            disabled={pending || operationActive}
          >
            {pending ? "…" : suspended ? "Démarrer" : "Arrêter"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={pending || operationActive}
          >
            <Trash2 className="size-4" aria-hidden />
            <span className="hidden sm:inline">Supprimer</span>
          </Button>
        </div>
      </header>

      {deleteOpen && (
        <DeleteServerConfirmation
          name={name}
          pending={pending}
          onConfirm={(keepStorage) => void handleDelete(keepStorage)}
          onCancel={() => setDeleteOpen(false)}
        />
      )}

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {warning !== null && (
        <Alert>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      {operation !== null && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span>{operationLabel(operation)}</span>
            {operation.message !== undefined && (
              <span className="text-muted-foreground">
                — {operation.message}
              </span>
            )}
            <span className="text-muted-foreground">
              Les actions sont désactivées jusqu&apos;à la fin de
              l&apos;opération.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {degraded?.status === "True" && degraded.message !== undefined && (
        <Alert variant="destructive">
          <AlertDescription>{degraded.message}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={view}
        onValueChange={(value) => setView(String(value))}
        className="gap-4"
      >
        <TabsList className="group-data-horizontal/tabs:h-auto h-auto w-full flex-wrap justify-start gap-1 rounded-xl border bg-muted/40 p-2">
          {VIEWS.map((item) => {
            const Icon = item.icon;
            return (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="justify-start gap-2 data-active:bg-primary/10 data-active:text-primary dark:data-active:bg-primary/10 dark:data-active:text-primary"
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="min-w-0">
          <TabsContent value="overview" className="mt-0">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
              <ConnectionPanel
                name={server.metadata.name}
                suspended={suspended}
              />
              <div className="flex min-w-0 flex-col gap-4">
                <PlayersPanel
                  name={server.metadata.name}
                  suspended={suspended}
                />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Accès rapide</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start gap-2"
                      onClick={() => setView("console")}
                    >
                      <Terminal className="size-4" aria-hidden />
                      Console
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start gap-2"
                      onClick={() => setView("logs")}
                    >
                      <ScrollText className="size-4" aria-hidden />
                      Logs
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start gap-2"
                      onClick={() => setView("backups")}
                    >
                      <Save className="size-4" aria-hidden />
                      Sauvegardes
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start gap-2"
                      onClick={() => setView("config")}
                    >
                      <SlidersHorizontal className="size-4" aria-hidden />
                      Configuration
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="config" keepMounted className="mt-0">
            <SettingsForm
              server={server}
              defaults={settings.defaults}
              effective={settings.effective}
              schema={schema}
              versions={versions}
              storageClasses={storageClasses}
              operationActive={operationActive}
              onReload={load}
              onSaved={(updated, merged) => {
                setServer(updated);
                setSettings({
                  defaults: settings.defaults,
                  effective: merged,
                });
              }}
            />
          </TabsContent>

          <TabsContent value="logs" className="mt-0">
            <LogsPanel name={server.metadata.name} />
          </TabsContent>

          <TabsContent value="events" className="mt-0">
            <EventsPanel name={server.metadata.name} />
          </TabsContent>

          <TabsContent value="console" className="mt-0">
            <ConsolePanel name={server.metadata.name} suspended={suspended} />
          </TabsContent>

          <TabsContent value="backups" className="mt-0">
            <BackupsPanel
              name={server.metadata.name}
              onRestoreStarted={handleOperationStarted}
            />
          </TabsContent>
        </div>
      </Tabs>
    </main>
  );
}
