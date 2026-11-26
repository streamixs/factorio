"use client";

import type { FactorioServer } from "@factorio/shared";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "cn";

import { CreateServerForm } from "@/app/_components/create-server-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getStorageClasses, getVersions } from "@/lib/api";

export function NewServerPage() {
  const router = useRouter();
  const [versions, setVersions] = useState<string[]>([]);
  const [storageClasses, setStorageClasses] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void Promise.all([
      getVersions().catch(() => []),
      getStorageClasses().catch(() => []),
    ]).then(([nextVersions, nextStorageClasses]) => {
      if (!active) {
        return;
      }
      setVersions(nextVersions);
      setStorageClasses(nextStorageClasses);
    });

    return () => {
      active = false;
    };
  }, []);

  function handleCreated(server: FactorioServer) {
    router.push(`/servers/view?name=${encodeURIComponent(server.metadata.name)}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href="/"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "w-fit gap-1",
        )}
      >
        <ArrowLeft className="size-4" aria-hidden />
        Tous les serveurs
      </Link>

      <div>
        <div className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="h-px w-5 bg-primary/70" aria-hidden />
          Création
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Nouveau serveur
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Trois étapes, des valeurs par défaut raisonnables, et les options
          avancées au bon endroit.
        </p>
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <CreateServerForm
            versions={versions}
            storageClasses={storageClasses}
            embedded
            onCreated={handleCreated}
            onError={setError}
          />
        </CardContent>
      </Card>
    </main>
  );
}
