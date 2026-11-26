"use client";

import type {
  ServerBackup,
  ServerBackups,
  ServerOperation,
} from "@factorio/shared";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  getServerOperations,
  importSave,
  restoreBackup,
} from "@/lib/api";
import { ACTIVE_OPERATION_PHASES, operationLabel } from "@/lib/operations";
import { formatDateTime } from "@/lib/format";
import { formatBytes } from "@/lib/server-connection";

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
  const [importing, setImporting] = useState(false);
  const [operation, setOperation] = useState<ServerOperation | null>(null);
  const previousPhase = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  const refreshOperations = useCallback(async () => {
    try {
      const operations = await getServerOperations(name);
      const latest = operations[0] ?? null;
      const previous = previousPhase.current;
      previousPhase.current = latest?.phase ?? null;
      setOperation(latest);

      if (
        latest !== null &&
        previous !== null &&
        previous !== latest.phase &&
        (latest.phase === "Completed" || latest.phase === "Failed")
      ) {
        void load();
        onRestoreStarted?.();
      }
    } catch {
      // The operation polling must not hide the saves error.
    }
  }, [name, load, onRestoreStarted]);

  const operationActive =
    operation !== null && ACTIVE_OPERATION_PHASES.has(operation.phase);
  const volumeUsed = data?.storage?.usedBytes ?? 0;
  const volumeTotal = data?.storage?.totalBytes;
  const volumeFree = data?.storage?.freeBytes;
  const volumePercent =
    volumeTotal !== undefined && volumeTotal > 0
      ? Math.min(100, Math.max(0, (volumeUsed / volumeTotal) * 100))
      : 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    void refreshOperations();

    const savesInterval = setInterval(() => {
      void load();
    }, 30000);
    const operationsInterval = setInterval(() => {
      void refreshOperations();
    }, 5000);

    return () => {
      clearInterval(savesInterval);
      clearInterval(operationsInterval);
    };
  }, [load, refreshOperations]);

  async function handleRestore(backup: ServerBackup) {
    if (
      !window.confirm(
        `Restaurer ${backup.name} ? Le serveur sera arrêté, la save principale (_autosave1.zip) copiée avant restauration, puis le serveur redémarré.`,
      )
    ) {
      return;
    }

    setRestoring(backup.name);
    setError(null);

    try {
      await restoreBackup(name, backup.name);
      toast.success("Restauration lancée.");
      onRestoreStarted?.();
      await refreshOperations();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible de restaurer la save";
      setError(message);
      toast.error(message);
    } finally {
      setRestoring(null);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file === undefined) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      const message = "Choisis un fichier .zip";
      setError(message);
      toast.error(message);
      return;
    }

    if (file.size > 1024 * 1024 * 1024) {
      const message = "La save dépasse la limite de 1 Go";
      setError(message);
      toast.error(message);
      return;
    }

    setImporting(true);
    setError(null);

    try {
      await importSave(name, file);
      toast.success("Importation lancée.");
      onRestoreStarted?.();
      await refreshOperations();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible d'importer la save";
      setError(message);
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Sauvegardes Factorio
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
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(event) => void handleImport(event)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInput.current?.click()}
            disabled={importing || restoring !== null || operationActive}
          >
            {importing ? "Importation…" : "Importer une save"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Autosaves écrites par Factorio dans /factorio/saves, ou import
            d&apos;un fichier .zip (1 Go maximum). L&apos;intervalle et le
            nombre de slots se règlent dans l&apos;onglet Sauvegarde
            automatique. Les 3 dernières copies de sécurité (avant
            restauration ou import) sont conservées.
          </p>
        </div>

        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {operationActive && operation !== null && (
          <Alert>
            <AlertDescription>
              {operationLabel(operation)}
              {operation.message !== undefined ? ` — ${operation.message}` : ""}
            </AlertDescription>
          </Alert>
        )}

        {operation?.phase === "Failed" && (
          <Alert variant="destructive">
            <AlertDescription>
              {operationLabel(operation)}
              {operation.message !== undefined ? ` : ${operation.message}` : ""}
            </AlertDescription>
          </Alert>
        )}

        {data?.storage !== undefined && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Sauvegardes</span>
              <span>{formatBytes(data.storage.savesBytes)}</span>
            </div>
            {volumeTotal !== undefined && volumeFree !== undefined && (
              <>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Volume</span>
                  <span>
                    {formatBytes(volumeUsed)} utilisés /{" "}
                    {formatBytes(volumeTotal)} · {formatBytes(volumeFree)}{" "}
                    libres
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${volumePercent}%` }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {loading && data === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : data === null || !data.available ? (
          operationActive ? null : (
            <Alert>
              <AlertDescription>
                Les sauvegardes sont indisponibles. Le serveur doit être
                démarré pour lire /factorio/saves.
              </AlertDescription>
            </Alert>
          )
        ) : data.backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune autosave pour l&apos;instant. Factorio en crée une à chaque
            intervalle de sauvegarde automatique.
          </p>
        ) : (
          <div className="flex flex-col">
            {data.backups.map((backup, index) => {
              const label = backupLabel(backup.name);
              return (
                <div key={backup.name}>
                  {index > 0 && <Separator />}
                  <div className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-mono text-xs">
                          {backup.name}
                        </p>
                        {label !== undefined && (
                          <Badge variant="secondary">{label}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(backup.size)} ·{" "}
                        {formatDateTime(backup.createdAt)}
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
                      disabled={restoring !== null || importing || operationActive}
                    >
                      {restoring === backup.name ? "Restauration…" : "Restaurer"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function backupLabel(name: string): string | undefined {
  if (name.startsWith("pre-restore-")) {
    return "avant restauration";
  }
  if (name.startsWith("pre-import-")) {
    return "avant import";
  }
  return undefined;
}
