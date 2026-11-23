import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from './public.decorator.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * Requires the shared internal bearer token on every non-public endpoint.
 * The token is injected by the Next server proxy and never reaches the
 * browser.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const expected = process.env.API_TOKEN;
    if (expected === undefined || expected === '') {
      throw new UnauthorizedException('API token is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const provided = header.slice(BEARER_PREFIX.length);
    if (!tokensMatch(provided, expected)) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    return true;
  }
}

function tokensMatch(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}
