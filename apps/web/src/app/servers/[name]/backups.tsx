"use client";

import type { ServerBackup, ServerBackups } from "@factorio/shared";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  backupDownloadUrl,
  getServerBackups,
  restoreBackup,
} from "@/lib/api";

export function BackupsPanel({
  name,
  onRestoreStarted,
}: {
  name: string;
  onRestoreStarted?: () => void;
}) {
  const [data, setData] = useState<ServerBackups | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await getServerBackups(name));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les sauvegardes",
      );
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleRestore(backup: ServerBackup) {
    if (
      !window.confirm(
        `Restaurer ${backup.name} ? Le serveur sera arrêté, la save actuelle copiée dans les backups, puis le serveur redémarré.`,
      )
    ) {
      return;
    }

    setRestoring(backup.name);
    setError(null);

    try {
      await restoreBackup(name, backup.name);
      toast.success("Restauration lancée. Le serveur va redémarrer.");
      onRestoreStarted?.();
      window.setTimeout(() => {
        setRestoring(null);
        void load();
      }, 15000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible de restaurer la save";
      setError(message);
      toast.error(message);
      setRestoring(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Sauvegardes
          {data !== null && (
            <Badge variant="secondary">{data.backups.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            Rafraîchir
          </Button>
          <p className="text-sm text-muted-foreground">
            Une copie est créée automatiquement selon l&apos;intervalle défini
            dans l&apos;onglet Sauvegardes de la configuration.
          </p>
        </div>

        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && data === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : data === null || !data.available ? (
          <Alert>
            <AlertDescription>
              Les sauvegardes sont indisponibles. Le serveur doit être démarré
              et le sidecar de backup prêt.
            </AlertDescription>
          </Alert>
        ) : data.backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune sauvegarde pour l&apos;instant. La première sera créée au
            prochain passage du sidecar.
          </p>
        ) : (
          <div className="flex flex-col">
            {data.backups.map((backup, index) => (
              <div key={backup.name}>
                {index > 0 && <Separator />}
                <div className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs">
                      {backup.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(backup.size)} ·{" "}
                      {formatTimestamp(backup.createdAt)}
                    </p>
                  </div>
                  <a
                    href={backupDownloadUrl(name, backup.name)}
                    download
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Télécharger
                  </a>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleRestore(backup)}
                    disabled={restoring !== null}
                  >
                    {restoring === backup.name ? "Restauration…" : "Restaurer"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} o`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} Ko`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
