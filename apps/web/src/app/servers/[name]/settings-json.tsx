"use client";

import type { ServerSettingsJson } from "@factorio/shared";
import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSettingsJson } from "@/lib/api";

const FILES = [
  { key: "server", label: "server-settings.json" },
  { key: "mapGen", label: "map-gen-settings.json" },
  { key: "mapSettings", label: "map-settings.json" },
] as const;

function formatJson(value: string): string {
  try {
    return `${JSON.stringify(JSON.parse(value), null, 2)}\n`;
  } catch {
    return value;
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function downloadJson(filename: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function SettingsJsonPanel({ name }: { name: string }) {
  const [data, setData] = useState<ServerSettingsJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await getServerSettingsJson(name));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les fichiers JSON",
      );
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("JSON copié");
    } catch {
      toast.error("Impossible de copier le JSON");
    }
  }

  function exportConfig() {
    if (data === null) {
      return;
    }

    const bundle: Record<string, unknown> = {};
    for (const file of FILES) {
      const raw = data[file.key];
      bundle[file.label] = raw === null ? null : parseJson(raw);
    }

    downloadJson(
      `factorio-config-${name}.json`,
      `${JSON.stringify(bundle, null, 2)}\n`,
    );
    toast.success("Configuration exportée");
  }

  const hasData =
    data !== null && FILES.some((file) => data[file.key] !== null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">JSON complet rendu</h3>
          <p className="text-sm text-muted-foreground">
            Fichiers réellement lus par Factorio. Les mots de passe et tokens
            sont masqués, y compris dans l&apos;export.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            Rafraîchir
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={exportConfig}
            disabled={!hasData}
          >
            <Download className="size-4" aria-hidden />
            Exporter la configuration
          </Button>
        </div>
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && data === null ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        FILES.map((file, index) => {
          const raw = data?.[file.key] ?? null;
          const value = raw === null ? null : formatJson(raw);

          return (
            <div key={file.key} className="flex flex-col gap-3">
              {index > 0 && <Separator />}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="font-mono text-sm font-medium">{file.label}</h4>
                {value !== null && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void copy(value)}
                    >
                      Copier
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadJson(file.label, value)}
                    >
                      <Download className="size-4" aria-hidden />
                      Télécharger
                    </Button>
                  </div>
                )}
              </div>
              {value === null ? (
                <p className="text-sm text-muted-foreground">
                  Non généré pour ce serveur.
                </p>
              ) : (
                <pre className="max-h-[420px] overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
                  {value}
                </pre>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
