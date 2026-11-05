"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { runRconCommand } from "@/lib/api";

interface ConsoleEntry {
  command: string;
  output: string;
  error: boolean;
}

export function ConsolePanel({
  name,
  suspended,
}: {
  name: string;
  suspended: boolean;
}) {
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<ConsoleEntry[]>([]);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = command.trim();
    if (value === "" || pending || suspended) {
      return;
    }

    setPending(true);

    try {
      const result = await runRconCommand(name, value);
      setHistory((entries) => [
        ...entries,
        {
          command: value,
          output: result.output === "" ? "(aucune réponse)" : result.output,
          error: false,
        },
      ]);
      setCommand("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible d'exécuter la commande";
      setHistory((entries) => [
        ...entries,
        { command: value, output: message, error: true },
      ]);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Console RCON</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {suspended && (
          <Alert>
            <AlertDescription>
              Le serveur est arrêté. Démarre-le pour utiliser la console.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={(event) => void submit(event)} className="flex gap-2">
          <Input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="/save, /shout bienvenue, /players"
            disabled={suspended || pending}
            autoComplete="off"
          />
          <Button
            type="submit"
            disabled={suspended || pending || command.trim() === ""}
          >
            {pending ? "…" : "Envoyer"}
          </Button>
        </form>

        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Les commandes envoyées et leurs réponses apparaissent ici.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {history.map((entry, index) => (
              <div
                key={`${index}-${entry.command}`}
                className="rounded-md border bg-muted/30 p-3 font-mono text-xs"
              >
                <p className="text-muted-foreground">&gt; {entry.command}</p>
                <pre
                  className={`mt-1 whitespace-pre-wrap ${
                    entry.error ? "text-destructive" : ""
                  }`}
                >
                  {entry.output}
                </pre>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Exemples : /save, /shout bienvenue, /players, /kick joueur.
        </p>
      </CardContent>
    </Card>
  );
}
