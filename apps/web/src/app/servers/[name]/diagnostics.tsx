"use client";

import type { ServerEvent, ServerLogs } from "@factorio/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { getServerEvents, getServerLogs } from "@/lib/api";

const cardClass =
  "flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

const controlClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

const buttonClass =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function LogsPanel({ name }: { name: string }) {
  const [tailLines, setTailLines] = useState(200);
  const [previous, setPrevious] = useState(false);
  const [live, setLive] = useState(true);
  const [data, setData] = useState<ServerLogs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const preRef = useRef<HTMLPreElement>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await getServerLogs(name, { tailLines, previous }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de charger les logs",
      );
    } finally {
      setLoading(false);
    }
  }, [name, tailLines, previous]);

  useEffect(() => {
    // Initial load, then polling. The rule only sees the call chain into load().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    if (!live) {
      return;
    }

    const interval = setInterval(() => {
      void load();
    }, 5000);

    return () => clearInterval(interval);
  }, [load, live]);

  useEffect(() => {
    const node = preRef.current;
    if (node !== null) {
      node.scrollTop = node.scrollHeight;
    }
  }, [data]);

  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Lignes
          <select
            className={controlClass}
            value={tailLines}
            onChange={(event) => setTailLines(Number(event.target.value))}
          >
            {[100, 200, 500, 1000].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={previous}
            onChange={(event) => setPrevious(event.target.checked)}
          />
          Logs précédents
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={live}
            onChange={(event) => setLive(event.target.checked)}
          />
          Live (5 s)
        </label>
        <button type="button" onClick={() => void load()} className={buttonClass}>
          Rafraîchir
        </button>
        {data?.pod !== null && data?.pod !== undefined && (
          <span className="font-mono text-xs text-zinc-500">{data.pod}</span>
        )}
      </div>

      {error !== null && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && data === null ? (
        <p className="text-sm text-zinc-500">Chargement des logs…</p>
      ) : (
        <pre
          ref={preRef}
          className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-100"
        >
          {data?.logs !== undefined && data.logs !== ""
            ? data.logs
            : "Aucun log disponible."}
        </pre>
      )}
    </section>
  );
}

export function EventsPanel({ name }: { name: string }) {
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      setEvents(await getServerEvents(name));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les events",
      );
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    if (!live) {
      return;
    }

    const interval = setInterval(() => {
      void load();
    }, 10000);

    return () => clearInterval(interval);
  }, [load, live]);

  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={live}
            onChange={(event) => setLive(event.target.checked)}
          />
          Live (10 s)
        </label>
        <button type="button" onClick={() => void load()} className={buttonClass}>
          Rafraîchir
        </button>
        <span className="text-sm text-zinc-500">
          {events.length} événement{events.length > 1 ? "s" : ""}
        </span>
      </div>

      {error !== null && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && events.length === 0 ? (
        <p className="text-sm text-zinc-500">Chargement des events…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Aucun événement pour ce serveur.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event, index) => (
            <li
              key={`${event.objectKind}/${event.objectName}/${event.reason}/${event.lastTimestamp}/${index}`}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={
                    event.type === "Warning"
                      ? "rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }
                >
                  {event.type}
                </span>
                <span className="font-medium">{event.reason}</span>
                <span className="font-mono text-zinc-500">
                  {event.objectKind}/{event.objectName}
                </span>
                {event.count > 1 && (
                  <span className="text-zinc-500">×{event.count}</span>
                )}
                <span className="ml-auto text-zinc-500">
                  {formatTimestamp(event.lastTimestamp)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {event.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTimestamp(value: string): string {
  if (value === "") {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
