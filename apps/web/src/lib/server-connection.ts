import type {
  ServerConnection,
  ServicePortInfo,
} from "@factorio/shared";

export function gamePort(
  connection: ServerConnection,
): ServicePortInfo | undefined {
  return (
    connection.ports.find(
      (port) => port.name === "game" || port.port === 34197,
    ) ?? connection.ports[0]
  );
}

/**
 * Formats host:port for copy/paste into Factorio. IPv6 addresses are wrapped
 * in brackets, as the game expects `[fd00::1]:34197`.
 */
export function hostPort(host: string, port: number): string {
  const formatted =
    host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `${formatted}:${port}`;
}

/**
 * Returns the address a player should use. LoadBalancer wins, then NodePort on
 * the first node address, then the in-cluster ClusterIP. The protocol is not
 * part of the address: Factorio only accepts `host:port`.
 */
export function primaryGameAddress(
  connection: ServerConnection | null | undefined,
): string | undefined {
  if (connection === null || connection === undefined || !connection.available) {
    return undefined;
  }

  const port = gamePort(connection);
  if (port === undefined) {
    return undefined;
  }

  if (connection.loadBalancer.length > 0) {
    return hostPort(connection.loadBalancer[0], port.port);
  }

  if (
    connection.serviceType === "NodePort" &&
    port.nodePort !== undefined &&
    connection.nodeAddresses.length > 0
  ) {
    const nodeAddress =
      connection.nodeAddresses.find((address) => !address.includes(":")) ??
      connection.nodeAddresses[0];
    return hostPort(nodeAddress, port.nodePort);
  }

  if (connection.clusterIP !== undefined) {
    return hostPort(connection.clusterIP, port.port);
  }

  return undefined;
}

/**
 * True when the displayed address is a ClusterIP, which is only reachable from
 * inside the cluster.
 */
export function gameAddressIsInternal(
  connection: ServerConnection | null | undefined,
): boolean {
  if (connection === null || connection === undefined || !connection.available) {
    return false;
  }

  const port = gamePort(connection);
  if (port === undefined) {
    return false;
  }

  if (connection.loadBalancer.length > 0) {
    return false;
  }

  if (
    connection.serviceType === "NodePort" &&
    port.nodePort !== undefined &&
    connection.nodeAddresses.length > 0
  ) {
    return false;
  }

  return connection.clusterIP !== undefined;
}

export function formatCpu(millicores: number): string {
  if (millicores >= 1000) {
    return `${(millicores / 1000).toFixed(2)} c`;
  }

  return `${Math.round(millicores)}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} o`;
  }
  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(0)} Ko`;
  }
  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(0)} Mo`;
  }

  return `${(bytes / 1024 ** 3).toFixed(2)} Go`;
}
