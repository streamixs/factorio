import type { FactorioServer } from "@factorio/shared";
import { describe, expect, it } from "vitest";

import { serverIsOnline, serverStatusBadge } from "./server-status";

function server(
  spec: FactorioServer["spec"],
  conditions: NonNullable<FactorioServer["status"]>["conditions"] = [],
): FactorioServer {
  return {
    metadata: { name: "test" },
    spec,
    status: { conditions },
  };
}

describe("serverStatusBadge", () => {
  it("labels a suspended server in French", () => {
    const badge = serverStatusBadge(server({ suspended: true }));
    expect(badge.label).toBe("Arrêté");
    expect(badge.tone).toBe("zinc");
  });

  it("labels a degraded server", () => {
    const badge = serverStatusBadge(
      server({}, [{ type: "Degraded", status: "True" }]),
    );
    expect(badge.label).toBe("Dégradé");
    expect(badge.tone).toBe("red");
  });

  it("labels an available server", () => {
    const badge = serverStatusBadge(
      server({}, [{ type: "Available", status: "True" }]),
    );
    expect(badge.label).toBe("En ligne");
    expect(badge.tone).toBe("emerald");
  });

  it("labels a starting server", () => {
    const badge = serverStatusBadge(
      server({}, [{ type: "Progressing", status: "True" }]),
    );
    expect(badge.label).toBe("Démarrage");
    expect(badge.tone).toBe("amber");
  });

  it("falls back to Inconnu", () => {
    const badge = serverStatusBadge(server({}));
    expect(badge.label).toBe("Inconnu");
    expect(badge.tone).toBe("zinc");
  });
});

describe("serverIsOnline", () => {
  it("is true only when the server is not suspended and is Available", () => {
    expect(
      serverIsOnline(server({}, [{ type: "Available", status: "True" }])),
    ).toBe(true);
    expect(
      serverIsOnline(
        server({ suspended: true }, [{ type: "Available", status: "True" }]),
      ),
    ).toBe(false);
    expect(serverIsOnline(server({}))).toBe(false);
  });
});
