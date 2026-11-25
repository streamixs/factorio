import type {
  ServerOperation,
  ServerOperationPhase,
} from "@factorio/shared";

export const ACTIVE_OPERATION_PHASES = new Set<ServerOperationPhase>([
  "Pending",
  "Suspending",
  "Running",
]);

/** Returns the operation whose reconciliation is still in progress. */
export function activeOperation(
  operations: ServerOperation[] | null | undefined,
): ServerOperation | undefined {
  return operations?.find((operation) =>
    ACTIVE_OPERATION_PHASES.has(operation.phase),
  );
}

export function operationLabel(operation: ServerOperation): string {
  const type = operation.type === "Import" ? "Importation" : "Restauration";

  switch (operation.phase) {
    case "Pending":
      return `${type} en préparation`;
    case "Suspending":
      return `${type} : arrêt du serveur`;
    case "Running":
      return `${type} : installation de la sauvegarde`;
    case "Completed":
      return `${type} terminée`;
    case "Failed":
      return `${type} échouée`;
  }
}
