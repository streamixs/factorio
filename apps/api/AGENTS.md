# API agent guide

NestJS API for the Factorio platform. It validates requests, talks to the
Kubernetes API and exposes the data the web UI needs.

## Layout

```text
src/main.ts                 bootstrap (port 3001)
src/app.module.ts           root module and global API-token guard
src/auth/                   bearer guard and @Public decorator
src/kubernetes/             Kubernetes client wrapper
src/servers/                controllers, service, schemas, Vitest specs
src/health/                 public health endpoint
```

The API is stateless except for the import volume. All durable server state
lives in the `FactorioServer`/`FactorioOperation` CRDs.

## Commands

```sh
pnpm --filter @factorio/api format:check
pnpm --filter @factorio/api format       # Prettier write
pnpm --filter @factorio/api lint         # oxlint
pnpm --filter @factorio/api test         # Vitest
pnpm --filter @factorio/api build
```

Run `pnpm --filter @factorio/shared build` first when shared types changed.

## Rules

- `ApiTokenGuard` is a global guard. New routes are private by default. Use
  `@Public()` only for health and the signed import download.
- The public health endpoint reports the platform version from `APP_VERSION`
  (defaults to `dev`). Do not hardcode a release version.
- Never return the API token or a Kubernetes Secret value in a response.
- Validate all input with a Zod schema from `@factorio/shared` (or a local
  schema when the value never leaves the API). Use `zodErrorMessage`.
- Kubernetes calls go through `this.call(...)` so 404/409/422 are mapped to
  Nest exceptions. Do not leak raw `ApiException` bodies.
- The service owns the API-side state machine: it creates operations but never
  runs the suspend/Job/resume logic. The agent does that.
- Settings updates send the CR generation and must return 409 when it changed.
  The API still uses the freshly read resourceVersion for the atomic replace.
- Import uploads are streamed, limited to 1 GiB, and checked against free space
  with a 256 MiB margin. Keep the signed import URL public; the operation Job
  cannot send the bearer token.
- The PVC detach for `keepStorage` uses a JSON Patch (`application/json-patch+json`)
  with a resourceVersion test. A merge-patch body is rejected by the client.
- Keep the API stateless: no in-memory cache for durable state except the
  short-lived schema/version caches.

## Tests

- Add or update a `*.spec.ts` next to the service/controller.
- Mock `KubernetesService` clients as in `servers.service.spec.ts`.
- Cover error maps, conflict cases and input validation, not only happy paths.
- Use `vi.stubGlobal('fetch', ...)` for the saves sidecar requests.

## Documentation

- Root [`AGENTS.md`](../../AGENTS.md).
- [`deploy/README.md`](../../deploy/README.md) for auth, RBAC and deployment.
- [`docs/runbook.md`](../../docs/runbook.md) for operations.
