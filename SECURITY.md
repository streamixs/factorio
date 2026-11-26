# Security policy

## Reporting a vulnerability

Do **not** open a public issue for a vulnerability. Use a private GitHub
security advisory:

<https://github.com/streamixs/factorio/security/advisories/new>

Include the affected component (`agent`, `api`, `web`, manifests), the version
or commit, reproduction steps, impact and any suggested mitigation. We aim to
acknowledge a report within a few days and will coordinate disclosure after a
fix is available. This is a best-effort project, not a commercial SLA.

## Supported versions

Only the latest published release is supported while the platform is pre-1.0.
Security fixes are released as a new patch tag; old tags are not backported.

## Security model

| Path | Control |
|---|---|
| Browser → web | HTTP Basic auth on the Next server. TLS is required beyond localhost; see the roadmap. |
| Web → API | Server-side proxy injects a bearer token. The browser never receives the token. |
| API → Kubernetes | In-cluster service account with a namespaced Role and a few cluster-wide read permissions. |
| API → Factorio | RCON and the saves sidecar are reachable only from API pods through NetworkPolicies. |
| Factorio pod | Non-root, read-only root filesystem, `RuntimeDefault` seccomp, all capabilities dropped, no service account token. |
| Operation Job | Non-root, read-only root filesystem, dropped capabilities, no service account token. |
| Secrets | Kubernetes Secrets; the API token, web password and RCON password are never stored in a CR or ConfigMap. |
| Images | Multi-arch release images, version tags and image pull secrets for private GHCR packages. |

The detailed decisions are in [`docs/decisions.md`](docs/decisions.md).
Operational procedures are in [`docs/runbook.md`](docs/runbook.md).

## Known limitations

These are accepted for the current local/LAN deployment and tracked in the
[`v0.4.0` roadmap](docs/roadmap.md):

- Basic auth is served over HTTP unless an ingress provides TLS.
- OIDC, session cookies and per-user roles are not implemented.
- Rate limiting and brute-force protection are not implemented.
- The API still manages Factorio resources in the `default` namespace.
- Egress NetworkPolicies and Pod Security Admission labels are incomplete.
- Audit logging is limited to RCON commands; API/agent mutations are not yet
  recorded as structured events.
- SBOM generation, image signing, provenance and image digest pinning are not
  in the release pipeline yet.
- There is no off-site backup or automated restore drill; saves currently live
  on the server PVC.

## Security checks

Run the local checks before proposing a change:

```sh
make check
make audit
```

`make audit` runs `pnpm audit --audit-level high` and `govulncheck`. CI runs the
same checks on every push and pull request.

## Scope

In scope: the agent, API, web UI, CRDs, deployment manifests, release workflow
and the container images built from this repository.

Out of scope: vulnerabilities in the upstream Factorio server, the
`factoriotools/factorio` image, Kubernetes itself or the cluster provider,
unless this repository configures them in an unsafe way.
