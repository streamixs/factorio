# Architecture decisions

Short records of decisions that should not be rediscovered or reverted without
a deliberate choice. Add a new section when a durable behavior changes.

## Versioning

- **Status:** accepted.
- **Decision:** one platform version in SemVer, released with Git tags
  `vX.Y.Z`. The first release is `v0.1.0`. The agent, API, web and images share
  that version.
- **Why:** components are deployed together and share CRDs/types. Per-component
  versions would require a compatibility matrix without a current benefit.
- **Separate concern:** the CRD API version is `v1alpha1`. It describes the
  Kubernetes schema, not the platform release.
- **Consequences:** local builds use `dev`; releases use immutable tags. Do not
  bump versions by hand once the release procedure is in place.

## Authentication

- **Status:** accepted.
- **Decision:** the browser uses HTTP Basic auth against the Next server. The
  Next server injects a bearer token into the `/api` proxy. The API accepts
  only that bearer token (except public health and signed import downloads).
- **Why:** the browser must never hold the API token. Basic auth is sufficient
  for a local/LAN deployment; TLS/OIDC can be added at the ingress later.
- **Consequences:** rotating the token or password requires restarting both
  API and web. Same-origin mutations are checked by `apps/web/src/proxy.ts`.

## Agent owns workloads

- **Status:** accepted.
- **Decision:** the API only creates/reads CRDs and Secrets. The agent owns the
  Deployment, Service, PVC, ConfigMaps, credentials/RCON Secrets and operation
  Jobs.
- **Why:** reconciliation survives API restarts and keeps Kubernetes-specific
  logic in one controller.
- **Consequences:** API code must not create Deployments or Jobs directly.

## Durable operations

- **Status:** accepted.
- **Decision:** restore/import are `FactorioOperation` CRDs. The agent suspends
  the server, waits for the pod to release the PVC, runs a Job, resumes the
  server when it was the one that stopped it, and keeps the operation durable.
- **Why:** an API or agent restart must not leave a server stopped or a save
  half-installed.
- **Consequences:** one active operation per server. Terminal operations are
  retained for 7 days. `operation-resumed` and `operation-expired` prevent old
  operations from restarting a server the user stopped manually.

## Settings concurrency

- **Status:** accepted.
- **Decision:** settings updates send the CR `metadata.generation`. The API
  returns 409 when it changed, and uses the freshly read `resourceVersion` for
  the atomic replace.
- **Why:** `resourceVersion` changes on status updates and would cause false
  conflicts; `generation` changes only when the spec changes.
- **Consequences:** the web form freezes its baseline, auto-refreshes when
  clean, and shows a non-destructive conflict banner when dirty.

## Retention

- **Status:** accepted.
- **Decision:** keep the 3 newest `pre-restore-*` and `pre-import-*` copies per
  type. Delete terminal operations after 7 days. Factorio autosaves are capped
  by `autoSave.slots`.
- **Why:** bounded disk usage and a small debugging history without unbounded
  CRD/volume growth.
- **Consequences:** the prune happens after the new save is installed so the
  selected source is never deleted before being copied.

## Keeping the data volume

- **Status:** accepted.
- **Decision:** deleting with “keep data” annotates the server with
  `keep-pvc-pending`, detaches the PVC with a JSON Patch, annotates the PVC with
  `keep-pvc`, then deletes the server. The agent adopts the PVC when a server
  with the same name is created and ignores it while `keep-pvc-pending` is set.
- **Why:** removing the ownerReference alone races with the agent, which can
  re-adopt the PVC and let Kubernetes garbage-collect it.
- **Consequences:** a kept PVC is reused only by the same server name. Orphan
  volumes must be deleted manually.

## Volume usage

- **Status:** accepted.
- **Decision:** the saves sidecar publishes `du` sizes for the saves directory
  and the whole data directory. The API combines them with the PVC capacity.
- **Why:** `df` reports the node filesystem on `local-path`, not the PVC size,
  and would show the node disk instead of the requested capacity.
- **Consequences:** when the PVC capacity cannot be read, the UI shows only the
  saves size and omits the volume bar.

## Imports

- **Status:** accepted.
- **Decision:** uploads are limited to 1 GiB and checked against free space with
  a 256 MiB safety margin. The operation downloads the save through a random,
  signed URL valid for 30 minutes.
- **Why:** the operation Job cannot send the API bearer token and the API must
  not buffer a 1 GiB upload in memory.
- **Consequences:** an expired import must be uploaded again. `ENOSPC` is
  reported as a clear error, not a 500.

## Network exposure

- **Status:** accepted.
- **Decision:** the game port UDP 34197 is public. Saves (8080) and RCON (27015)
  accept traffic only from the API. The API accepts traffic only from web and
  operation pods. The web is ClusterIP and is reached by port-forward or
  ingress.
- **Why:** limit the attack surface and keep saves/RCON off the network.
- **Consequences:** NetworkPolicies require a CNI that enforces them. The Kind
  default CNI does not; use Calico/Cilium for network tests.

## Development and release images

- **Status:** accepted.
- **Decision:** local development uses local `:dev` images and `make deploy`
  forces a rollout. Releases use immutable GHCR tags built from Git tags. The
  agent image builds on `BUILDPLATFORM` and cross-compiles to `TARGETARCH` so
  multi-arch releases do not run the Go toolchain under emulation.
- **Why:** rebuilding the same `:dev` tag does not otherwise restart pods, and
  releases must be reproducible.
- **Consequences:** production deploys should pass explicit `IMG`/`TAG`
  values, not rely on local images.
