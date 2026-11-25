"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function DeleteServerConfirmation({
  name,
  pending,
  onConfirm,
  onCancel,
}: {
  name: string;
  pending: boolean;
  onConfirm: (keepStorage: boolean) => void;
  onCancel: () => void;
}) {
  const [keepStorage, setKeepStorage] = useState(true);
  const checkboxID = `delete-keep-storage-${name}`;

  return (
    <Alert variant="destructive">
      <AlertTitle>Supprimer {name} ?</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id={checkboxID}
              checked={keepStorage}
              onCheckedChange={(checked) => setKeepStorage(checked === true)}
              disabled={pending}
            />
            <Label
              htmlFor={checkboxID}
              className="flex flex-col gap-1 font-normal"
            >
              <span>Conserver les données (recommandé)</span>
              <span className="text-xs font-normal text-muted-foreground">
                Le volume persistant pourra être réutilisé en recréant un
                serveur avec le même nom.
              </span>
            </Label>
          </div>

          {!keepStorage && (
            <p className="text-sm text-destructive">
              Le volume persistant, les sauvegardes et les réglages seront
              définitivement supprimés.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => onConfirm(keepStorage)}
              disabled={pending}
            >
              {pending ? "Suppression…" : "Supprimer"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={pending}
            >
              Annuler
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
