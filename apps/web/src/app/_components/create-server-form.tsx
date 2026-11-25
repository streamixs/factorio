"use client";

import type {
  FactorioServer,
  ResourcesSettings,
  ServiceType,
} from "@factorio/shared";
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
import {
  validateResourceQuantities,
  type ResourceField,
  type ResourceIssue,
} from "@/lib/resource-quantities";

const SERVICE_TYPES: ServiceType[] = ["ClusterIP", "NodePort", "LoadBalancer"];
const SERVICE_OPTIONS = SERVICE_TYPES.map((type) => ({
  value: type,
  label: type,
}));
const DEFAULT_STORAGE_CLASS = "__cluster_default__";
const DEFAULT_VERSION = "2.1.24";

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim() ?? "";
  return result === "" ? undefined : result;
}

export function CreateServerForm({
  versions,
  storageClasses,
  onCreated,
  onError,
}: {
  versions: string[];
  storageClasses: string[];
  onCreated: (server: FactorioServer) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [version, setVersion] = useState(DEFAULT_VERSION);
  const [maxPlayers, setMaxPlayers] = useState("8");
  const [seed, setSeed] = useState("");
  const [storageSize, setStorageSize] = useState("10Gi");
  const [storageClass, setStorageClass] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>("ClusterIP");
  const [gamePassword, setGamePassword] = useState("");
  const [resources, setResources] = useState<ResourcesSettings>({
    cpuRequest: "500m",
    cpuLimit: "2",
    memoryRequest: "1Gi",
    memoryLimit: "4Gi",
  });
  const [resourceError, setResourceError] = useState<ResourceIssue | null>(null);
  const [creating, setCreating] = useState(false);

  const versionValue =
    versions.length > 0 && !versions.includes(version) ? versions[0] : version;
  const versionOptions = versions.map((value) => ({ value, label: value }));
  const storageClassValue =
    storageClass === "" ? DEFAULT_STORAGE_CLASS : storageClass;
  const storageClassOptions = [
    { value: DEFAULT_STORAGE_CLASS, label: "Défaut du cluster" },
    ...storageClasses.map((value) => ({ value, label: value })),
  ];

  function setResource(field: ResourceField, value: string) {
    setResources((current) => ({ ...current, [field]: value }));
    if (resourceError?.field === field) {
      setResourceError(null);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized: ResourcesSettings = {
      cpuRequest: trimmed(resources.cpuRequest),
      cpuLimit: trimmed(resources.cpuLimit),
      memoryRequest: trimmed(resources.memoryRequest),
      memoryLimit: trimmed(resources.memoryLimit),
    };
    const issue = validateResourceQuantities(normalized);
    if (issue !== undefined) {
      setResourceError(issue);
      return;
    }
    setResourceError(null);
    setCreating(true);

    try {
      const created = await createServer({
        name: name.trim(),
        version: trimmed(versionValue),
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
        storage: {
          size: trimmed(storageSize),
          storageClassName: trimmed(storageClass),
        },
        resources: Object.values(normalized).some(
          (value) => value !== undefined,
        )
          ? normalized
          : undefined,
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
              {versionOptions.length > 0 ? (
                <Select
                  items={versionOptions}
                  value={versionValue}
                  onValueChange={(value) => {
                    if (value !== null) {
                      setVersion(value);
                    }
                  }}
                >
                  <SelectTrigger id="create-version" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {versionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="create-version"
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  placeholder={DEFAULT_VERSION}
                />
              )}
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
              <Label htmlFor="create-storage">Stockage</Label>
              <Input
                id="create-storage"
                value={storageSize}
                onChange={(event) => setStorageSize(event.target.value)}
                placeholder="10Gi"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-storage-class">StorageClass</Label>
              {storageClassOptions.length > 1 ? (
                <Select
                  items={storageClassOptions}
                  value={storageClassValue}
                  onValueChange={(value) => {
                    setStorageClass(
                      value === null || value === DEFAULT_STORAGE_CLASS
                        ? ""
                        : value,
                    );
                  }}
                >
                  <SelectTrigger id="create-storage-class" className="w-full">
                    <span
                      data-slot="select-value"
                      className="flex flex-1 text-left"
                    >
                      {storageClassOptions.find(
                        (option) => option.value === storageClassValue,
                      )?.label ?? "Défaut du cluster"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {storageClassOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="create-storage-class"
                  value={storageClass}
                  onChange={(event) => setStorageClass(event.target.value)}
                  placeholder="Défaut du cluster"
                />
              )}
            </div>
          </div>

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
            <Label htmlFor="create-service">Type de Service</Label>
            <Select
              items={SERVICE_OPTIONS}
              value={serviceType}
              onValueChange={(value) => setServiceType(value as ServiceType)}
            >
              <SelectTrigger id="create-service" className="w-full">
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

          <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Ressources</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-cpu-request">CPU request</Label>
                <Input
                  id="create-cpu-request"
                  value={resources.cpuRequest ?? ""}
                  onChange={(event) =>
                    setResource("cpuRequest", event.target.value)
                  }
                  placeholder="500m"
                  aria-invalid={resourceError?.field === "cpuRequest"}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-cpu-limit">CPU limit</Label>
                <Input
                  id="create-cpu-limit"
                  value={resources.cpuLimit ?? ""}
                  onChange={(event) =>
                    setResource("cpuLimit", event.target.value)
                  }
                  placeholder="2"
                  aria-invalid={resourceError?.field === "cpuLimit"}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-memory-request">Mémoire request</Label>
                <Input
                  id="create-memory-request"
                  value={resources.memoryRequest ?? ""}
                  onChange={(event) =>
                    setResource("memoryRequest", event.target.value)
                  }
                  placeholder="1Gi"
                  aria-invalid={resourceError?.field === "memoryRequest"}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-memory-limit">Mémoire limit</Label>
                <Input
                  id="create-memory-limit"
                  value={resources.memoryLimit ?? ""}
                  onChange={(event) =>
                    setResource("memoryLimit", event.target.value)
                  }
                  placeholder="4Gi"
                  aria-invalid={resourceError?.field === "memoryLimit"}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Quantités Kubernetes (ex. 500m, 2, 1Gi). La limite doit être
              supérieure ou égale à la request.
            </p>
            {resourceError !== null && (
              <p role="alert" className="text-xs text-destructive">
                {resourceError.message}
              </p>
            )}
          </fieldset>

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
