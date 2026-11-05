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
 * Returns the address a player should use. LoadBalancer wins, then NodePort on
 * the first node address, then the in-cluster ClusterIP.
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
    return `${connection.loadBalancer[0]}:${port.port}/UDP`;
  }

  if (
    connection.serviceType === "NodePort" &&
    port.nodePort !== undefined &&
    connection.nodeAddresses.length > 0
  ) {
    const nodeAddress =
      connection.nodeAddresses.find((address) => !address.includes(":")) ??
      connection.nodeAddresses[0];
    return `${nodeAddress}:${port.nodePort}/UDP`;
  }

  if (connection.clusterIP !== undefined) {
    return `${connection.clusterIP}:${port.port}/UDP (interne)`;
  }

  return undefined;
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
