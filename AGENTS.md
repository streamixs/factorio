# AGENTS.md

Instructions for AI coding agents working on this repository. Read
[`README.md`](README.md), [`deploy/README.md`](deploy/README.md),
[`docs/runbook.md`](docs/runbook.md) and
[`docs/decisions.md`](docs/decisions.md) before changing behavior.

## Repository map

| Path | Purpose |
|---|---|
| `apps/agent` | Go Kubernetes operator for `FactorioServer` and `FactorioOperation`. Owns Deployments, Services, PVCs, ConfigMaps, Secrets and operation Jobs. |
| `apps/api` | NestJS API. Validates input with Zod, talks to the Kubernetes API, exposes logs/backups/RCON/imports. |
| `apps/web` | Next.js 16 UI. Server-side `/api` proxy, Basic auth, French UI. |
| `libs/shared` | Shared TypeScript types and Zod schemas. Build it before API/web tests or builds. |
| `deploy` | Kustomize manifests for the API, web, NetworkPolicies and import PVC. |
| `docs` | Runbook and architecture decisions. |

## Golden commands

From the repository root:

```sh
make check              # lint + test + build (the reference before declaring done)
make test               # API + web + agent tests
make test-api
make test-web
make test-agent
make lint
make build
make docker             # build local :dev images
make fmt                # API Prettier + agent gofmt
make version            # print VERSION
make version-check      # VERSION, package versions and tag consistency
make release VERSION=x.y.z
```

Per component:

```sh
pnpm --filter @factorio/api test
pnpm --filter @factorio/web test
pnpm --filter @factorio/web lint
pnpm --filter @factorio/web exec tsc --noEmit
make -C apps/agent fmt lint test
```

Do not deploy unless the user explicitly asks. Deployment changes the shared
cluster and may restart running Factorio servers.

## Conventions

- **Code, comments, identifiers and commit messages are in English.**
- **User-facing UI text and API error messages surfaced by the UI are in
  French** (the API itself currently returns English messages).
- Conventional commits: `feat(scope): ...`, `fix(scope): ...`,
  `docs(scope): ...`, `test(scope): ...`, `build(scope): ...`, `ci: ...`,
  `chore: ...`, `refactor(scope): ...`, `perf(scope): ...`, `revert: ...`.
  Merges are squash merges; the PR title becomes the commit.
- TypeScript is strict. Define shared types/schemas in `libs/shared` first.
- Go code must pass `go fmt` and `golangci-lint`.
- Next.js 16 has breaking changes. Read `apps/web/AGENTS.md` and the relevant
  guide under `apps/web/node_modules/next/dist/docs/` before writing Next code.
- Never expose the API bearer token to the browser. The Next server proxy is
  the only place that injects it.
- Do not edit generated agent files (`config/crd/bases`, generated RBAC,
  `zz_generated.*`, `PROJECT`). Use `make manifests` / `make generate`.

## Task recipes

### Add a Factorio setting

1. `libs/shared`: add the type and Zod schema.
2. `apps/agent/api/v1alpha1`: add the CRD field and markers.
3. `apps/agent/internal/controller`: map the field into the rendered config.
4. `apps/agent/internal/controller/resources`: update deployment/config
   rendering if needed.
5. `apps/api/src/servers`: expose the field through the CRD schema.
6. `apps/web/src/lib/settings`: add the catalog/section entry.
7. Run `make -C apps/agent manifests generate`, agent tests, API tests and web
   tests/build.

### Add an API endpoint

1. Add the shared request/response type in `libs/shared` if it crosses the API
   boundary.
2. Implement controller/service logic in `apps/api/src/servers`.
3. Add or update API tests in `apps/api/src/servers/*.spec.ts`.
4. Add the client method in `apps/web/src/lib/api.ts`.
5. Wire the UI and add a web helper test if the logic is pure.

### Add an operation type

1. `apps/agent/api/v1alpha1`: operation spec/type changes and markers.
2. `apps/agent/internal/controller`: state machine changes (suspend → Job →
   resume) and annotations.
3. `apps/agent/internal/controller/resources/operation.go`: Job script and
   retention.
4. `apps/api/src/servers`: operation creation and validation.
5. `apps/web`: operations panel and labels.
6. Run `make -C apps/agent manifests generate` and all tests.

### Change Docker or CI

1. Update the Dockerfile and the matching job in `.github/workflows/ci.yml`.
2. Build locally with the same contexts:
   ```sh
   docker build -f apps/api/Dockerfile -t factorio-api:dev .
   docker build -f apps/web/Dockerfile -t factorio-web:dev .
   docker build -f apps/agent/Dockerfile -t factorio-agent:dev apps/agent
   ```
3. Verify the release workflow if the change affects image tags or args.

### Release

The platform uses one SemVer version and Git tags `vX.Y.Z`. The CRD API version
`v1alpha1` is separate from the platform version. Do not bump versions or create
tags by hand:

```sh
make release VERSION=0.1.0
```

The script runs `make check`, updates `VERSION`/package versions, commits, tags
and pushes. The tag workflow publishes GHCR images and the GitHub Release. See
[`docs/release.md`](docs/release.md).

## Known pitfalls

- `make -C deploy deploy` and agent `make deploy` force a rollout. A rebuilt
  `:dev` image is not loaded without it.
- Settings updates use `metadata.generation`, not `resourceVersion` (status
  updates bump `resourceVersion`). A stale generation must produce 409.
- Operations suspend the server, run a Job and resume it. Terminal operations
  are deleted after 7 days; `operation-resumed` prevents restarting a server
  the user stopped manually.
- A kept PVC is detached by the API with `keep-pvc` and
  `keep-pvc-pending` annotations. The agent must not adopt it while the
  server is being deleted.
- On `local-path`, `df` reports the node disk. Volume usage uses `du` plus the
  PVC capacity.
- Import URLs are signed and expire after 30 minutes; uploads are limited to
  1 GiB with a 256 MiB free-space margin.
- The default Kind CNI does not enforce NetworkPolicies. Use Calico/Cilium for
  network tests.
- A port-forward to the web Service becomes stale after an API/web rollout;
  restart it after a 502.
- Release images are private by default. The API, web and agent Deployments
  reference the `ghcr-pull` secret; create it in `factorio-system` and
  `agent-system`, or make the GHCR packages public. A missing secret only logs
  a warning and does not block local `:dev` images.
- A failed operation must not be resumed by a later retention reconcile.

## Definition of done

- `make check` passes for the touched components.
- New pure logic has a unit test.
- Shared types and docs are updated when behavior changes.
- The PR template validation/deployment sections are filled.
- No secret, token, or generated file is committed accidentally.
