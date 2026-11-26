import { NextResponse, type NextRequest } from 'next/server';

const REALM = 'Factorio Platform';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function proxy(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return new NextResponse('Cross-origin request rejected', { status: 403 });
  }

  const user = process.env.WEB_AUTH_USER;
  const password = process.env.WEB_AUTH_PASSWORD;
  if (user === undefined || user === '' || password === undefined || password === '') {
    return new NextResponse('Authentication is not configured', {
      status: 503,
    });
  }

  const header = request.headers.get('authorization');
  const credentials = decodeBasicHeader(header);
  if (
    credentials === undefined ||
    !(await credentialsMatch(credentials, `${user}:${password}`))
  ) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      },
    });
  }

  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  if (
    segments[0] === 'servers' &&
    segments[1] !== undefined &&
    segments[1] !== 'new' &&
    segments[1] !== 'view'
  ) {
    let name = segments[1];
    try {
      name = decodeURIComponent(name);
    } catch {
      // Keep the raw segment; the API will reject invalid server names.
    }
    const target = request.nextUrl.clone();
    target.pathname = '/servers/view';
    target.search = `?name=${encodeURIComponent(name)}`;
    return NextResponse.redirect(target);
  }

  return NextResponse.next();
}

function isSameOriginMutation(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method)) {
    return true;
  }

  const origin = request.headers.get('origin');
  if (origin !== null) {
    try {
      const originHost = new URL(origin).host;
      const host = request.headers.get('host');
      if (host === null || originHost !== host) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}

function decodeBasicHeader(header: string | null): string | undefined {
  if (header === null || !header.startsWith('Basic ')) {
    return undefined;
  }

  try {
    return atob(header.slice('Basic '.length));
  } catch {
    return undefined;
  }
}

async function credentialsMatch(
  provided: string,
  expected: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);

  return timingSafeEqual(
    new Uint8Array(providedHash),
    new Uint8Array(expectedHash),
  );
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|health).*)'],
};
