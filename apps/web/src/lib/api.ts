import type {
  CreateFactorioServerInput,
  EffectiveSettings,
  FactorioServer,
  ServerBackups,
  ServerConnection,
  ServerEvent,
  ServerLogs,
  ServerOperation,
  ServerUsage,
  UpdateFactorioServerInput,
} from "@factorio/shared";

// Empty by default: in the cluster the Next server proxies /api to the API
// Service. In local development .env.local points at http://localhost:3001.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/api/servers${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (body.message !== undefined) {
        message = Array.isArray(body.message)
          ? body.message.join(", ")
          : body.message;
      }
    } catch {
      // The response has no JSON body, keep the generic message.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function listServers(): Promise<FactorioServer[]> {
  return request<FactorioServer[]>("");
}

export function getServer(name: string): Promise<FactorioServer> {
  return request<FactorioServer>(`/${encodeURIComponent(name)}`);
}

export function updateServer(
  name: string,
  input: UpdateFactorioServerInput,
): Promise<FactorioServer> {
  return request<FactorioServer>(`/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function createServer(
  input: CreateFactorioServerInput,
): Promise<FactorioServer> {
  return request<FactorioServer>("", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteServer(name: string): Promise<void> {
  return request<void>(`/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export function startServer(name: string): Promise<FactorioServer> {
  return request<FactorioServer>(`/${encodeURIComponent(name)}/start`, {
    method: "POST",
  });
}

export function stopServer(name: string): Promise<FactorioServer> {
  return request<FactorioServer>(`/${encodeURIComponent(name)}/stop`, {
    method: "POST",
  });
}

export function getServerLogs(
  name: string,
  options: { tailLines: number; previous: boolean },
): Promise<ServerLogs> {
  const params = new URLSearchParams({
    tailLines: String(options.tailLines),
  });

  if (options.previous) {
    params.set("previous", "true");
  }

  return request<ServerLogs>(
    `/${encodeURIComponent(name)}/logs?${params.toString()}`,
  );
}

export function getServerEvents(name: string): Promise<ServerEvent[]> {
  return request<ServerEvent[]>(`/${encodeURIComponent(name)}/events`);
}

export function getEffectiveSettings(name: string): Promise<EffectiveSettings> {
  return request<EffectiveSettings>(`/${encodeURIComponent(name)}/effective`);
}

export function getServerConnection(name: string): Promise<ServerConnection> {
  return request<ServerConnection>(`/${encodeURIComponent(name)}/connection`);
}

export function getServerUsage(name: string): Promise<ServerUsage> {
  return request<ServerUsage>(`/${encodeURIComponent(name)}/usage`);
}

export function getServerBackups(name: string): Promise<ServerBackups> {
  return request<ServerBackups>(`/${encodeURIComponent(name)}/backups`);
}

export function backupDownloadUrl(name: string, file: string): string {
  return `${API_URL}/api/servers/${encodeURIComponent(name)}/backups/${encodeURIComponent(file)}`;
}

export function restoreBackup(
  name: string,
  file: string,
): Promise<{ operation: string }> {
  return request<{ operation: string }>(
    `/${encodeURIComponent(name)}/backups/${encodeURIComponent(file)}/restore`,
    { method: "POST" },
  );
}

export function importSave(
  name: string,
  file: File,
): Promise<{ operation: string }> {
  return request<{ operation: string }>(`/${encodeURIComponent(name)}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: file,
  });
}

export function getServerOperations(
  name: string,
): Promise<ServerOperation[]> {
  return request<ServerOperation[]>(
    `/${encodeURIComponent(name)}/operations`,
  );
}

export function runRconCommand(
  name: string,
  command: string,
): Promise<{ output: string }> {
  return request<{ output: string }>(`/${encodeURIComponent(name)}/rcon`, {
    method: "POST",
    body: JSON.stringify({ command }),
  });
}
