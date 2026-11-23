"use client";

import type { FactorioServer, ServiceType } from "@factorio/shared";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createServer } from "@/lib/api";

const SERVICE_TYPES: ServiceType[] = ["ClusterIP", "NodePort", "LoadBalancer"];
const SERVICE_OPTIONS = SERVICE_TYPES.map((type) => ({
  value: type,
  label: type,
}));

export function CreateServerForm({
  onCreated,
  onError,
}: {
  onCreated: (server: FactorioServer) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [version, setVersion] = useState("2.1.24");
  const [maxPlayers, setMaxPlayers] = useState("8");
  const [seed, setSeed] = useState("");
  const [storageSize, setStorageSize] = useState("10Gi");
  const [serviceType, setServiceType] = useState<ServiceType>("ClusterIP");
  const [gamePassword, setGamePassword] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);

    try {
      const created = await createServer({
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
        credentials:
          gamePassword === "" ? undefined : { gamePassword },
      });
      onCreated(created);
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "Impossible de créer le serveur",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Nouveau serveur</CardTitle>
        <CardDescription>
          La ressource est créée dans le namespace configuré sur l&apos;API.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="create-name">Nom</Label>
            <Input
              id="create-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="my-factorio"
              pattern={"[a-z0-9]([\\-a-z0-9]*[a-z0-9])?"}
              maxLength={63}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="create-display-name">Nom affiché</Label>
            <Input
              id="create-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="My Factorio Server"
              maxLength={64}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-version">Version</Label>
              <Input
                id="create-version"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="2.1.24"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-max-players">Joueurs max</Label>
              <Input
                id="create-max-players"
                type="number"
                min={0}
                value={maxPlayers}
                onChange={(event) => setMaxPlayers(event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-seed">Seed</Label>
              <Input
                id="create-seed"
                type="number"
                min={0}
                max={4294967295}
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                placeholder="aléatoire"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-storage">Stockage</Label>
              <Input
                id="create-storage"
                value={storageSize}
                onChange={(event) => setStorageSize(event.target.value)}
                placeholder="10Gi"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="create-service">Type de Service</Label>
            <Select
              items={SERVICE_OPTIONS}
              value={serviceType}
              onValueChange={(value) => setServiceType(value as ServiceType)}
            >
              <SelectTrigger id="create-service">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="create-password">Mot de passe de partie</Label>
            <Input
              id="create-password"
              type="password"
              value={gamePassword}
              onChange={(event) => setGamePassword(event.target.value)}
              placeholder="Optionnel"
            />
          </div>

          <Button type="submit" disabled={creating}>
            {creating ? "Création…" : "Créer le serveur"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
