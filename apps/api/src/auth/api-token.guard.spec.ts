import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { ApiTokenGuard } from './api-token.guard.js';

describe('ApiTokenGuard', () => {
  const getAllAndOverride = vi.fn();
  const reflector = { getAllAndOverride } as unknown as Reflector;

  let guard: ApiTokenGuard;
  let previousToken: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    previousToken = process.env.API_TOKEN;
    process.env.API_TOKEN = 'expected-token';
    getAllAndOverride.mockReturnValue(false);
    guard = new ApiTokenGuard(reflector);
  });

  afterEach(() => {
    if (previousToken === undefined) {
      delete process.env.API_TOKEN;
    } else {
      process.env.API_TOKEN = previousToken;
    }
  });

  function contextWith(authorization?: string): ExecutionContext {
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows public routes', () => {
    getAllAndOverride.mockReturnValue(true);

    expect(guard.canActivate(contextWith())).toBe(true);
  });

  it('rejects a missing token', () => {
    expect(() => guard.canActivate(contextWith())).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an invalid token', () => {
    expect(() => guard.canActivate(contextWith('Bearer wrong'))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the expected token', () => {
    expect(guard.canActivate(contextWith('Bearer expected-token'))).toBe(true);
  });

  it('fails closed when the server token is not configured', () => {
    delete process.env.API_TOKEN;

    expect(() =>
      guard.canActivate(contextWith('Bearer expected-token')),
    ).toThrow(UnauthorizedException);
  });
});
