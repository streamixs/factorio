import type { ServerConnection } from "@factorio/shared";
import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatCpu,
  gameAddressIsInternal,
  gamePort,
  hostPort,
  primaryGameAddress,
} from "./server-connection";

function connection(
  overrides: Partial<ServerConnection> = {},
): ServerConnection {
  return {
    available: true,
    serviceType: "ClusterIP",
    clusterIP: "10.0.0.10",
    ports: [{ name: "game", port: 34197, protocol: "UDP" }],
    loadBalancer: [],
    nodeAddresses: [],
    ...overrides,
  };
}

describe("hostPort", () => {
  it("formats an IPv4 address", () => {
    expect(hostPort("192.168.1.10", 34197)).toBe("192.168.1.10:34197");
  });

  it("brackets an IPv6 address", () => {
    expect(hostPort("fd00::1", 34197)).toBe("[fd00::1]:34197");
  });

  it("keeps an already bracketed IPv6 address", () => {
    expect(hostPort("[fd00::1]", 34197)).toBe("[fd00::1]:34197");
  });
});

describe("primaryGameAddress", () => {
  it("returns undefined when the service is unavailable", () => {
    expect(primaryGameAddress(connection({ available: false }))).toBeUndefined();
    expect(primaryGameAddress(null)).toBeUndefined();
    expect(primaryGameAddress(undefined)).toBeUndefined();
  });

  it("returns undefined when no port is exposed", () => {
    expect(primaryGameAddress(connection({ ports: [] }))).toBeUndefined();
  });

  it("prefers the LoadBalancer address", () => {
    expect(
      primaryGameAddress(
        connection({
          serviceType: "LoadBalancer",
          loadBalancer: ["203.0.113.10"],
          nodeAddresses: ["192.168.1.10"],
        }),
      ),
    ).toBe("203.0.113.10:34197");
  });

  it("uses the NodePort and an IPv4 node address", () => {
    expect(
      primaryGameAddress(
        connection({
          serviceType: "NodePort",
          ports: [
            {
              name: "game",
              port: 34197,
              protocol: "UDP",
              nodePort: 30231,
            },
          ],
          nodeAddresses: ["fd00::1", "192.168.1.10"],
        }),
      ),
    ).toBe("192.168.1.10:30231");
  });

  it("formats an IPv6 NodePort address when there is no IPv4 address", () => {
    expect(
      primaryGameAddress(
        connection({
          serviceType: "NodePort",
          ports: [
            {
              name: "game",
              port: 34197,
              protocol: "UDP",
              nodePort: 30231,
            },
          ],
          nodeAddresses: ["fd00::1"],
        }),
      ),
    ).toBe("[fd00::1]:30231");
  });

  it("falls back to the ClusterIP when NodePort details are missing", () => {
    expect(
      primaryGameAddress(
        connection({
          serviceType: "NodePort",
          ports: [{ name: "game", port: 34197, protocol: "UDP" }],
        }),
      ),
    ).toBe("10.0.0.10:34197");

    expect(
      primaryGameAddress(
        connection({
          serviceType: "NodePort",
          ports: [
            {
              name: "game",
              port: 34197,
              protocol: "UDP",
              nodePort: 30231,
            },
          ],
        }),
      ),
    ).toBe("10.0.0.10:34197");
  });

  it("returns undefined without a LoadBalancer, NodePort address or ClusterIP", () => {
    expect(
      primaryGameAddress(
        connection({
          serviceType: "NodePort",
          clusterIP: undefined,
          ports: [{ name: "game", port: 34197, protocol: "UDP" }],
        }),
      ),
    ).toBeUndefined();
  });
});

describe("gameAddressIsInternal", () => {
  it("marks ClusterIP addresses as internal", () => {
    expect(gameAddressIsInternal(connection())).toBe(true);
  });

  it("does not mark LoadBalancer addresses as internal", () => {
    expect(
      gameAddressIsInternal(
        connection({
          serviceType: "LoadBalancer",
          loadBalancer: ["203.0.113.10"],
        }),
      ),
    ).toBe(false);
  });

  it("does not mark NodePort addresses with a node as internal", () => {
    expect(
      gameAddressIsInternal(
        connection({
          serviceType: "NodePort",
          ports: [
            {
              name: "game",
              port: 34197,
              protocol: "UDP",
              nodePort: 30231,
            },
          ],
          nodeAddresses: ["192.168.1.10"],
        }),
      ),
    ).toBe(false);
  });

  it("marks a NodePort fallback to ClusterIP as internal", () => {
    expect(
      gameAddressIsInternal(
        connection({
          serviceType: "NodePort",
          ports: [{ name: "game", port: 34197, protocol: "UDP" }],
        }),
      ),
    ).toBe(true);
  });

  it("does not mark an unavailable service as internal", () => {
    expect(gameAddressIsInternal(connection({ available: false }))).toBe(false);
    expect(gameAddressIsInternal(null)).toBe(false);
  });
});

describe("gamePort", () => {
  it("finds the named game port", () => {
    const port = gamePort(
      connection({
        ports: [
          { name: "other", port: 1234, protocol: "TCP" },
          { name: "game", port: 34197, protocol: "UDP" },
        ],
      }),
    );

    expect(port?.name).toBe("game");
  });

  it("finds a port by its number", () => {
    const port = gamePort(
      connection({
        ports: [{ name: "game-udp", port: 34197, protocol: "UDP" }],
      }),
    );

    expect(port?.port).toBe(34197);
  });

  it("falls back to the first port", () => {
    const port = gamePort(
      connection({
        ports: [{ name: "custom", port: 40000, protocol: "UDP" }],
      }),
    );

    expect(port?.port).toBe(40000);
  });
});

describe("formatting helpers", () => {
  it("formats CPU millicores", () => {
    expect(formatCpu(250)).toBe("250m");
    expect(formatCpu(1000)).toBe("1.00 c");
    expect(formatCpu(1500)).toBe("1.50 c");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(500)).toBe("500 o");
    expect(formatBytes(1536)).toBe("2 Ko");
    expect(formatBytes(5 * 1024 ** 2)).toBe("5 Mo");
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.00 Go");
  });
});
