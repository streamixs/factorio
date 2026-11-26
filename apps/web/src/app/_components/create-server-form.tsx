"use client";

import type {
  FactorioServer,
  ResourcesSettings,
  ServiceType,
} from "@factorio/shared";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { cn } from "cn";

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
import { shouldBlockCreateSubmit } from "@/lib/create-form";
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
const NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const STEP_LABELS = ["Identité", "Monde", "Ressources"] as const;

interface ResourcePreset {
  id: string;
  label: string;
  description: string;
  values: Required<
    Pick<
      ResourcesSettings,
      "cpuRequest" | "cpuLimit" | "memoryRequest" | "memoryLimit"
    >
  >;
}

const RESOURCE_PRESETS: ResourcePreset[] = [
  {
    id: "small",
    label: "Petit",
    description: "2 joueurs · 1 cœur / 2 Gi",
    values: {
      cpuRequest: "250m",
      cpuLimit: "1",
      memoryRequest: "512Mi",
      memoryLimit: "2Gi",
    },
  },
  {
    id: "standard",
    label: "Standard",
    description: "8 joueurs · 2 cœurs / 4 Gi",
    values: {
      cpuRequest: "500m",
      cpuLimit: "2",
      memoryRequest: "1Gi",
      memoryLimit: "4Gi",
    },
  },
  {
    id: "large",
    label: "Grand",
    description: "20 joueurs · 4 cœurs / 8 Gi",
    values: {
      cpuRequest: "1",
      cpuLimit: "4",
      memoryRequest: "2Gi",
      memoryLimit: "8Gi",
    },
  },
];

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim() ?? "";
  return result === "" ? undefined : result;
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEP_LABELS.map((label, index) => {
        const value = index + 1;
        const done = current > value;
        const active = current === value;

        return (
          <div key={label} className="contents">
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full border font-mono text-[10px] font-semibold",
                  active &&
                    "border-primary/40 bg-primary/10 text-primary",
                  done &&
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  !active && !done && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3" /> : value}
              </span>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:inline",
                  active && "text-primary",
                  done && "text-emerald-700 dark:text-emerald-400",
                  !active && !done && "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {value < STEP_LABELS.length && (
              <span className="h-px flex-1 bg-border" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CreateServerForm({
  versions,
  storageClasses,
  onCreated,
  onError,
  embedded = false,
}: {
  versions: string[];
  storageClasses: string[];
  onCreated: (server: FactorioServer) => void;
  onError: (message: string) => void;
  embedded?: boolean;
}) {
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [version, setVersion] = useState("");
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
  const [resourceError, setResourceError] = useState<ResourceIssue | null>(
    null,
  );
  const [creating, setCreating] = useState(false);

  const versionValue =
    version !== "" ? version : versions[0] ?? DEFAULT_VERSION;
  const versionOptions =
    versions.length === 0
      ? []
      : versions.includes(versionValue)
        ? versions.map((value) => ({ value, label: value }))
        : [
            { value: versionValue, label: versionValue },
            ...versions.map((value) => ({ value, label: value })),
          ];
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

  function applyPreset(values: ResourcesSettings) {
    setResources(values);
    setResourceError(null);
  }

  function presetSelected(values: ResourcesSettings): boolean {
    return (Object.keys(values) as ResourceField[]).every(
      (field) => (resources[field] ?? "") === (values[field] ?? ""),
    );
  }

  function identityError(): string | null {
    if (!NAME_PATTERN.test(name.trim())) {
      return "Le nom technique doit contenir des minuscules, des chiffres et des tirets (DNS-1123), sans tiret au début ni à la fin.";
    }
    return null;
  }

  function goNext() {
    if (step === 1) {
      const problem = identityError();
      if (problem !== null) {
        setStepError(problem);
        return;
      }
      setName(name.trim());
    }

    setStepError(null);
    setStep((current) => Math.min(STEP_LABELS.length, current + 1));
  }

  function goBack() {
    setStepError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  /**
   * Enter advances the two first steps, but must not create the server from
   * the resources step. Operators often press Enter after filling a field;
   * only the explicit "Créer le serveur" button should submit the form.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    const tagName =
      event.target instanceof HTMLElement ? event.target.tagName : "";
    if (
      shouldBlockCreateSubmit(
        step,
        STEP_LABELS.length,
        event.key,
        tagName,
      )
    ) {
      event.preventDefault();
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step < STEP_LABELS.length) {
      goNext();
      return;
    }

    const problem = identityError();
    if (problem !== null) {
      setStep(1);
      setStepError(problem);
      return;
    }

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

    setStepError(null);
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

  const form = (
    <form
      onSubmit={(event) => void handleCreate(event)}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-5"
      noValidate
    >
      <Stepper current={step} />

      {stepError !== null && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {stepError}
        </p>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="create-name">Nom technique</Label>
            <Input
              autoFocus
              id="create-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (stepError !== null) {
                  setStepError(null);
                }
              }}
              placeholder="my-factorio"
              pattern={"[a-z0-9]([\\-a-z0-9]*[a-z0-9])?"}
              maxLength={63}
              required
            />
            <p className="text-xs text-muted-foreground">
              DNS-1123 : minuscules, chiffres et tirets. Il ne pourra plus être
              modifié.
            </p>
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
            <p className="text-xs text-muted-foreground">
              Utilisé dans l&apos;interface et par les joueurs.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-version">Version Factorio</Label>
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
              <p className="text-xs text-muted-foreground">0 = illimité.</p>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
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
            <p className="text-xs text-muted-foreground">
              Laisse vide pour générer un monde aléatoire. Les réglages avancés
              de la map restent disponibles après la création.
            </p>
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

          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Le mot de passe est écrit dans un Secret Kubernetes. Il
            n&apos;apparaît jamais dans les réponses de l&apos;API.
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Preset de ressources</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {RESOURCE_PRESETS.map((preset) => {
                const selected = presetSelected(preset.values);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.values)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors",
                      selected
                        ? "border-primary/40 bg-primary/10"
                        : "border-border bg-background/40 hover:border-primary/30",
                    )}
                  >
                    <span className="block text-xs font-semibold">
                      {preset.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {preset.description}
                    </span>
                  </button>
                );
              })}
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
            <p className="text-xs text-muted-foreground">
              ClusterIP reste interne au cluster. NodePort expose un port sur
              chaque nœud.
            </p>
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
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={goBack}
          disabled={step === 1 || creating}
        >
          <ChevronLeft className="size-4" />
          Retour
        </Button>
        {step < STEP_LABELS.length ? (
          <Button type="button" onClick={goNext}>
            Continuer
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={creating}>
            {creating ? "Création…" : "Créer le serveur"}
          </Button>
        )}
      </div>
    </form>
  );

  if (embedded) {
    return form;
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Nouveau serveur</CardTitle>
        <CardDescription>
          La ressource est créée dans le namespace configuré sur l&apos;API.
        </CardDescription>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
}
