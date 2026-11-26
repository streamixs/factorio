"use client";

import type { ServerPlayers } from "@factorio/shared";
import { Loader2, UserMinus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerPlayers, kickServerPlayer } from "@/lib/api";

export function PlayersPanel({
  name,
  suspended,
}: {
  name: string;
  suspended: boolean;
}) {
  const [data, setData] = useState<ServerPlayers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const next = await getServerPlayers(name);
      setData(next);
      setConfirming((current) =>
        current !== null && !next.players.includes(current) ? null : current,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les joueurs",
      );
    }
  }, [name]);

  useEffect(() => {
    if (suspended) {
      return;
    }

    // Initial load and polling both go through the same function. The rule
    // only sees the call chain into the async setState calls.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    const interval = setInterval(() => {
      void load();
    }, 10000);

    return () => clearInterval(interval);
  }, [load, suspended]);

  async function kick(player: string) {
    setPending(player);
    setError(null);

    try {
      await kickServerPlayer(name, player);
      toast.success(`${player} a été expulsé`);
      setConfirming(null);
      await load();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible d'expulser le joueur";
      setError(message);
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  const count = data?.available === true ? data.players.length : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <Users className="size-4" aria-hidden />
          Joueurs en ligne
          {count !== undefined && <Badge variant="secondary">{count}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {suspended ? (
          <p className="text-sm text-muted-foreground">
            Le serveur est arrêté. Démarre-le pour voir les joueurs en ligne.
          </p>
        ) : data === null ? (
          <Skeleton className="h-20 w-full" />
        ) : !data.available ? (
          <p className="text-sm text-muted-foreground">
            Liste indisponible : la console RCON ne répond pas. Réessaie dans
            quelques instants.
          </p>
        ) : data.players.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun joueur connecté.
          </p>
        ) : (
          <ul className="divide-y">
            {data.players.map((player) => (
              <li
                key={player}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {player}
                </span>
                <div className="flex items-center gap-1">
                  {confirming === player ? (
                    <>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void kick(player)}
                        disabled={pending === player}
                      >
                        {pending === player ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          "Confirmer"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirming(null)}
                        disabled={pending === player}
                      >
                        Annuler
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirming(player)}
                      disabled={pending !== null}
                    >
                      <UserMinus className="size-3.5" aria-hidden />
                      Expulser
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!suspended && data?.available === true && (
          <p className="text-xs text-muted-foreground">
            Rafraîchi toutes les 10 secondes via RCON.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
