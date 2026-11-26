import type { ServerOperation } from "@factorio/shared";
import { describe, expect, it } from "vitest";

import { activeOperation, operationLabel } from "./operations";

function operation(
  overrides: Partial<ServerOperation> = {},
): ServerOperation {
  return {
    name: "operation",
    type: "Restore",
    phase: "Pending",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("activeOperation", () => {
  it("returns undefined for an empty list", () => {
    expect(activeOperation([])).toBeUndefined();
    expect(activeOperation(null)).toBeUndefined();
    expect(activeOperation(undefined)).toBeUndefined();
  });

  it("finds Pending, Suspending and Running operations", () => {
    for (const phase of ["Pending", "Suspending", "Running"] as const) {
      expect(activeOperation([operation({ phase })])?.phase).toBe(phase);
    }
  });

  it("ignores Completed and Failed operations", () => {
    expect(
      activeOperation([
        operation({ phase: "Completed" }),
        operation({ phase: "Failed" }),
      ]),
    ).toBeUndefined();
  });

  it("returns the first active operation", () => {
    const first = operation({ name: "first", phase: "Running" });
    const second = operation({ name: "second", phase: "Pending" });

    expect(activeOperation([first, second])).toBe(first);
  });
});

describe("operationLabel", () => {
  it("labels restore phases", () => {
    expect(operationLabel(operation({ phase: "Pending" }))).toBe(
      "Restauration en préparation",
    );
    expect(operationLabel(operation({ phase: "Suspending" }))).toBe(
      "Restauration : arrêt du serveur",
    );
    expect(operationLabel(operation({ phase: "Running" }))).toBe(
      "Restauration : installation de la sauvegarde",
    );
    expect(operationLabel(operation({ phase: "Completed" }))).toBe(
      "Restauration terminée",
    );
    expect(operationLabel(operation({ phase: "Failed" }))).toBe(
      "Restauration échouée",
    );
  });

  it("labels import phases", () => {
    expect(
      operationLabel(operation({ type: "Import", phase: "Pending" })),
    ).toBe("Importation en préparation");
    expect(
      operationLabel(operation({ type: "Import", phase: "Suspending" })),
    ).toBe("Importation : arrêt du serveur");
    expect(
      operationLabel(operation({ type: "Import", phase: "Running" })),
    ).toBe("Importation : installation de la sauvegarde");
    expect(
      operationLabel(operation({ type: "Import", phase: "Completed" })),
    ).toBe("Importation terminée");
    expect(
      operationLabel(operation({ type: "Import", phase: "Failed" })),
    ).toBe("Importation échouée");
  });
});
