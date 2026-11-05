"use client";

import {
  findCondition,
  type EffectiveSettings,
  type FactorioServer,
} from "@factorio/shared";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteServer,
  getEffectiveSettings,
  getServer,
  startServer,
  stopServer,
} from "@/lib/api";
import { serverStatusBadge } from "@/lib/server-status";

import { BackupsPanel } from "./backups";
import { ConnectionPanel } from "./connection";
import { ConsolePanel } from "./console";
import { EventsPanel, LogsPanel } from "./diagnostics";
import { SettingsForm } from "./settings-form";

const VIEWS = [
  { id: "config", label: "Configuration" },
  { id: "connection", label: "Connexion" },
  { id: "logs", label: "Logs" },
  { id: "events", label: "Events" },
  { id: "console", label: "Console" },
  { id: "backups", label: "Sauvegardes" },
] as const;

export default function ServerDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ServerDetail />
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-96 w-full" />
    </main>
  );
}

function ServerDetail() {
  const params = useParams<{ name: string }>();
  const name = typeof params.name === "string" ? params.name : "";
  const router = useRouter();

  const [server, setServer] = useState<FactorioServer | null>(null);
  const [settings, setSettings] = useState<EffectiveSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [view, setView] = useState<string>("config");

  const load = useCallback(async () => {
    if (name === "") {
      setError("Nom de serveur manquant");
      setLoading(false);
      return;
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
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de charger le serveur",
      );
    } finally {
      setLoading(false);
    }
  }, [name]);

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

  async function handleDelete() {
    if (
      !window.confirm(
        `Supprimer ${name} ? Son volume persistant sera supprimé avec lui.`,
      )
    ) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      await deleteServer(name);
      toast.success("Serveur supprimé");
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
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <DetailSkeleton />
      </main>
    );
  }

  if (server === null || settings === null) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-10 sm:px-6 lg:px-8">
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
  const degraded = findCondition(server, "Degraded");
  const displayName =
    server.spec.server?.identity?.name ?? server.metadata.name;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
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
            <h1 className="truncate font-mono text-2xl font-semibold tracking-tight">
              {server.metadata.name}
            </h1>
            <Badge variant="outline" className={badge.className}>
              {badge.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {displayName} · v{server.spec.version ?? "unknown"}
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
            disabled={pending}
          >
            {pending ? "…" : suspended ? "Démarrer" : "Arrêter"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={pending}
          >
            Supprimer
          </Button>
        </div>
      </header>

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

      {degraded?.status === "True" && degraded.message !== undefined && (
        <Alert variant="destructive">
          <AlertDescription>{degraded.message}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={view}
        onValueChange={(value) => setView(String(value))}
        className="flex-col"
      >
        <TabsList className="h-auto flex-wrap">
          {VIEWS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="config" keepMounted className="mt-4">
          <SettingsForm
            server={server}
            defaults={settings.defaults}
            effective={settings.effective}
            onSaved={(updated, merged) => {
              setServer(updated);
              setSettings({
                defaults: settings.defaults,
                effective: merged,
              });
            }}
          />
        </TabsContent>

        <TabsContent value="connection" className="mt-4">
          <ConnectionPanel
            name={server.metadata.name}
            suspended={suspended}
          />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <LogsPanel name={server.metadata.name} />
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <EventsPanel name={server.metadata.name} />
        </TabsContent>

        <TabsContent value="console" className="mt-4">
          <ConsolePanel name={server.metadata.name} suspended={suspended} />
        </TabsContent>

        <TabsContent value="backups" className="mt-4">
          <BackupsPanel
            name={server.metadata.name}
            onRestoreStarted={() => {
              window.setTimeout(() => {
                void load();
              }, 15000);
            }}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
