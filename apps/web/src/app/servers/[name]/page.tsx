"use client";

import { findCondition, type FactorioServer } from "@factorio/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { deleteServer, getServer, startServer, stopServer } from "@/lib/api";
import { serverStatusBadge } from "@/lib/server-status";

import { EventsPanel, LogsPanel } from "./diagnostics";
import { SettingsForm } from "./settings-form";

const VIEWS = [
  { id: "config", label: "Configuration" },
  { id: "logs", label: "Logs" },
  { id: "events", label: "Events" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

export default function ServerDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 text-sm text-zinc-500 sm:px-6 lg:px-8">
          Chargement du serveur…
        </main>
      }
    >
      <ServerDetail />
    </Suspense>
  );
}

function ServerDetail() {
  const params = useParams<{ name: string }>();
  const name = typeof params.name === "string" ? params.name : "";
  const router = useRouter();

  const [server, setServer] = useState<FactorioServer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [view, setView] = useState<ViewId>("config");

  const refresh = useCallback(async () => {
    if (name === "") {
      setError("Nom de serveur manquant");
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setServer(await getServer(name));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de charger le serveur",
      );
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    // Initial load. The state is set from an async response, not during this
    // render, but the rule only sees the call chain into refresh().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

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
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de changer l'état",
      );
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
      router.push("/");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de supprimer le serveur",
      );
      setPending(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 text-sm text-zinc-500 sm:px-6 lg:px-8">
        Chargement du serveur…
      </main>
    );
  }

  if (server === null) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Tous les serveurs
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error ?? "Serveur introuvable"}
        </div>
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
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Tous les serveurs
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate font-mono text-2xl font-semibold tracking-tight">
              {server.metadata.name}
            </h1>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {displayName} · v{server.spec.version ?? "unknown"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={pending}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Rafraîchir
          </button>
          <button
            type="button"
            onClick={() => void handleToggle()}
            disabled={pending}
            className={
              suspended
                ? "rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                : "rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
            }
          >
            {pending ? "…" : suspended ? "Démarrer" : "Arrêter"}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={pending}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
          >
            Supprimer
          </button>
        </div>
      </header>

      {error !== null && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {degraded?.status === "True" && degraded.message !== undefined && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {degraded.message}
        </div>
      )}

      <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={
              view === item.id
                ? "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={view === "config" ? "" : "hidden"}>
        <SettingsForm
          server={server}
          onSaved={(updated) => setServer(updated)}
        />
      </div>

      {view === "logs" && <LogsPanel name={server.metadata.name} />}
      {view === "events" && <EventsPanel name={server.metadata.name} />}
    </main>
  );
}
