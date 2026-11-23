import type { NextRequest } from 'next/server';

type RouteContext = { params: Promise<{ path: string[] }> };
type StreamingRequestInit = RequestInit & { duplex?: 'half' };

const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

/**
 * Server-side proxy for the NestJS API. The browser only knows the Next
 * origin; the shared API token stays in the web server process.
 */
async function proxy(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const apiUrl = process.env.API_INTERNAL_URL;
  const apiToken = process.env.API_TOKEN;
  if (apiUrl === undefined || apiUrl === '' || apiToken === undefined || apiToken === '') {
    return new Response('Web API proxy is not configured', { status: 503 });
  }

  const { path } = await context.params;
  let target: URL;
  try {
    target = new URL(
      `/api/${path.map((segment) => encodeURIComponent(segment)).join('/')}`,
      apiUrl,
    );
  } catch {
    return new Response('Web API proxy is misconfigured', { status: 503 });
  }
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('authorization');
  headers.set('authorization', `Bearer ${apiToken}`);

  const init: StreamingRequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
    signal: request.signal,
  };

  if (request.body !== null) {
    init.body = request.body;
    init.duplex = 'half';
  }

  let response: Response;
  try {
    response = await fetch(target, init);
  } catch {
    return new Response('API is unreachable', { status: 502 });
  }

  const responseHeaders = new Headers(response.headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    responseHeaders.delete(header);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function HEAD(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
