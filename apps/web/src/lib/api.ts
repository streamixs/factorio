import type {
  CreateFactorioServerInput,
  FactorioServer,
} from "@factorio/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
