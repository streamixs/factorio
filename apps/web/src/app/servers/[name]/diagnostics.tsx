"use client";

import type { ServerEvent, ServerLogs } from "@factorio/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getServerEvents, getServerLogs } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const TAIL_OPTIONS = [100, 200, 500, 1000].map((value) => ({
  value: String(value),
  label: String(value),
}));

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
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Logs
          {data?.pod !== null && data?.pod !== undefined && (
            <Badge variant="outline" className="font-mono text-xs">
              {data.pod}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="tail-lines">Lignes</Label>
            <Select
              items={TAIL_OPTIONS}
              value={String(tailLines)}
              onValueChange={(value) => setTailLines(Number(value))}
            >
              <SelectTrigger id="tail-lines" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAIL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={previous} onCheckedChange={setPrevious} />
            Logs précédents
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={live} onCheckedChange={setLive} />
            Temps réel (5 s)
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
          >
            Rafraîchir
          </Button>
        </div>

        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && data === null ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <ScrollArea className="h-[60vh] rounded-lg border bg-zinc-950">
            <pre
              ref={preRef}
              className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-zinc-100"
            >
              {data?.logs !== undefined && data.logs !== ""
                ? data.logs
                : "Aucun log disponible."}
            </pre>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
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
        err instanceof Error ? err.message : "Impossible de charger les events",
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
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Événements
          <Badge variant="secondary">{events.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={live} onCheckedChange={setLive} />
            Temps réel (10 s)
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
          >
            Rafraîchir
          </Button>
        </div>

        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && events.length === 0 ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun événement pour ce serveur.
          </p>
        ) : (
          <div className="flex flex-col">
            {events.map((event, index) => (
              <div key={`${event.objectKind}/${event.objectName}/${event.reason}/${event.lastTimestamp}/${index}`}>
                {index > 0 && <Separator />}
                <div className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant={
                        event.type === "Warning" ? "destructive" : "secondary"
                      }
                    >
                      {event.type}
                    </Badge>
                    <span className="font-medium">{event.reason}</span>
                    <span className="font-mono text-muted-foreground">
                      {event.objectKind}/{event.objectName}
                    </span>
                    {event.count > 1 && (
                      <span className="text-muted-foreground">
                        ×{event.count}
                      </span>
                    )}
                    <span className="ml-auto text-muted-foreground">
                      {formatDateTime(event.lastTimestamp)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{event.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
