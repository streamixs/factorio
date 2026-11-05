"use client";

import {
  conditionStatus,
  findCondition,
  type FactorioServer,
  type ServiceType,
} from "@factorio/shared";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { createServer, deleteServer, listServers, startServer, stopServer } from "@/lib/api";

const SERVICE_TYPES: ServiceType[] = ["ClusterIP", "NodePort", "LoadBalancer"];

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800";

const labelClass =
  "flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300";

function statusBadge(server: FactorioServer): {
  label: string;
  className: string;
} {
  if (server.spec.suspended === true) {
    return {
      label: "Stopped",
      className:
        "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    };
  }

  if (conditionStatus(server, "Degraded") === "True") {
    return {
      label: "Degraded",
      className:
        "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    };
  }

  if (conditionStatus(server, "Available") === "True") {
    return {
      label: "Available",
      className:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    };
  }

  if (conditionStatus(server, "Progressing") === "True") {
    return {
      label: "Starting",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    };
  }

  return {
    label: "Unknown",
    className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  };
}

export default function Home() {
  const [servers, setServers] = useState<FactorioServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [version, setVersion] = useState("2.1.0");
  const [maxPlayers, setMaxPlayers] = useState("8");
  const [seed, setSeed] = useState("");
  const [storageSize, setStorageSize] = useState("10Gi");
  const [serviceType, setServiceType] = useState<ServiceType>("ClusterIP");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setServers(await listServers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach the API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load. refresh() sets state from an async response, not during
    // this render, but the rule only sees the call chain into it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);

    try {
      await createServer({
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
      });

      setName("");
      setDisplayName("");
      setSeed("");
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create the server",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(server: FactorioServer) {
    const suspended = server.spec.suspended === true;
    const name = server.metadata.name;

    setPendingAction(name);
    setError(null);

    try {
      await (suspended ? startServer(name) : stopServer(name));
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Unable to ${suspended ? "start" : "stop"} the server`,
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete(serverName: string) {
    if (
      !window.confirm(
        `Delete ${serverName}? Its persistent volume will be removed with it.`,
      )
    ) {
      return;
    }

    setPendingDeletion(serverName);
    setError(null);

    try {
      await deleteServer(serverName);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete the server",
      );
    } finally {
      setPendingDeletion(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Factorio Platform
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Manage the Factorio servers running in Kubernetes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="self-start rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      </header>

      {error !== null && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">Servers</h2>

          {loading && (
            <p className="text-sm text-zinc-500">Loading servers…</p>
          )}

          {!loading && servers.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No server yet. Create one from the form.
            </div>
          )}

          {servers.map((server) => {
            const badge = statusBadge(server);
            const degraded = findCondition(server, "Degraded");
            const suspended = server.spec.suspended === true;
            const storage = server.spec.storage?.size ?? "10Gi";
            const service = server.spec.service?.type ?? "ClusterIP";
            const players = server.spec.server?.access?.maxPlayers ?? 0;
            const display =
              server.spec.server?.identity?.name ?? server.metadata.name;

            return (
              <article
                key={server.metadata.name}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate font-mono text-base font-medium">
                      {server.metadata.name}
                    </h3>
                    <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                      {display} · v{server.spec.version ?? "unknown"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    Max players
                  </dt>
                  <dd>{players === 0 ? "Unlimited" : players}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Storage</dt>
                  <dd>{storage}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Service</dt>
                  <dd>{service}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">Created</dt>
                  <dd>
                    {server.metadata.creationTimestamp === undefined
                      ? "—"
                      : new Date(
                          server.metadata.creationTimestamp,
                        ).toLocaleDateString()}
                  </dd>
                </dl>

                {degraded?.status === "True" && degraded.message !== undefined && (
                  <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                    {degraded.message}
                  </p>
                )}

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleToggle(server)}
                    disabled={pendingAction === server.metadata.name}
                    className={
                      suspended
                        ? "rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
                        : "rounded-lg border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950"
                    }
                  >
                    {pendingAction === server.metadata.name
                      ? suspended
                        ? "Starting…"
                        : "Stopping…"
                      : suspended
                        ? "Start"
                        : "Stop"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(server.metadata.name)}
                    disabled={pendingDeletion === server.metadata.name}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    {pendingDeletion === server.metadata.name
                      ? "Deleting…"
                      : "Delete"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <form
          onSubmit={(event) => void handleCreate(event)}
          className="flex h-fit flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <h2 className="text-lg font-medium">New server</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              The resource is created in the namespace configured on the API.
            </p>
          </div>

          <label className={labelClass}>
            Name
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-factorio"
              pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?"
              maxLength={63}
              required
            />
          </label>

          <label className={labelClass}>
            Display name
            <input
              className={inputClass}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="My Factorio Server"
              maxLength={64}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Version
              <input
                className={inputClass}
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="2.1.0"
              />
            </label>
            <label className={labelClass}>
              Max players
              <input
                className={inputClass}
                type="number"
                min={0}
                value={maxPlayers}
                onChange={(event) => setMaxPlayers(event.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Map seed
              <input
                className={inputClass}
                type="number"
                min={0}
                max={4294967295}
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                placeholder="random"
              />
            </label>
            <label className={labelClass}>
              Storage
              <input
                className={inputClass}
                value={storageSize}
                onChange={(event) => setStorageSize(event.target.value)}
                placeholder="10Gi"
              />
            </label>
          </div>

          <label className={labelClass}>
            Service type
            <select
              className={inputClass}
              value={serviceType}
              onChange={(event) =>
                setServiceType(event.target.value as ServiceType)
              }
            >
              {SERVICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {creating ? "Creating…" : "Create server"}
          </button>
        </form>
      </section>
    </main>
  );
}
