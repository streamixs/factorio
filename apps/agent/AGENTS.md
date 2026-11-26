# Agent agent guide

Go Kubernetes operator for the Factorio platform. It reconciles
`FactorioServer` and `FactorioOperation` and owns every workload resource.

## Layout

```text
cmd/main.go                         manager entrypoint
api/v1alpha1/                       CRD types, markers, generated deepcopy
internal/controller/                FactorioServer/FactorioOperation reconcilers
internal/controller/resources/      Deployment, Service, PVC, config, Job builders
config/crd/bases/                   generated CRDs (do not edit)
config/rbac/                        generated RBAC (do not edit)
config/samples/                     example CRs
test/e2e/                           optional Kind e2e tests (not in CI)
```

## Commands

```sh
make fmt lint test                   # reference checks
make test
make manifests generate              # after editing types or markers
make run                             # local process, current kubeconfig
make docker-build IMG=factorio-agent:dev
make deploy IMG=factorio-agent:dev    # installs CRDs and restarts the agent
```

`make test` downloads envtest binaries and runs the controller suite.

## Critical rules

- Do not edit `**/zz_generated.*`, `config/crd/bases/*`,
  `config/rbac/role.yaml`, `config/webhook/manifests.yaml` or `PROJECT`.
  Regenerate them with `make manifests generate`.
- Do not remove `// +kubebuilder:scaffold:*` markers.
- Use `kubebuilder create api/webhook` to scaffold new types; do not create
  scaffolding files by hand.
- After editing `*_types.go` or markers, run `make manifests generate`.
- After editing Go files, run `make fmt lint test`.

## Server reconciliation

`FactorioServerReconciler` renders settings and converges:

- the data PVC `<name>-data`;
- the server and RCON Secrets and the settings ConfigMaps;
- the Deployment with the Factorio container and `saves` sidecar;
- the UDP Service.

The PVC has a controller owner reference. A kept PVC is adopted only when the
server is not marked `keep-pvc-pending`; see `docs/decisions.md`.

## Operation reconciliation

`FactorioOperationReconciler` owns the durable state machine:

```text
Pending → Suspending → Running → Completed
                           └────→ Failed
```

- Suspend the server when needed and wait for the pod to release the PVC.
- Run a Job that copies the current save, installs the target and prunes old
  safety copies.
- Resume only a server the operation stopped.
- Keep terminal operations for 7 days, then delete them.
- `operation-resumed` prevents retention from restarting a server the user
  stopped manually; `operation-expired` skips the finalizer resume safety net.

Do not move this logic into the API.

## Known pitfalls

- The agent logs its platform version from `internal/version`, injected with
  `-ldflags` at build time. Do not hardcode a release version.
- The operation Job runs as user 845; the data volume is owned by the Factorio
  user.
- The saves sidecar writes `index.txt` and `usage.txt`; it must handle SIGTERM
  immediately or pod deletion waits for the grace period.
- Storage usage uses `du` and the PVC capacity, not `df` (local-path reports
  the node disk).
- A `FactorioOperation` conflict must be resolved deterministically; pending
  operations use their name as a tie-break.
- The default Kind CNI does not enforce NetworkPolicies.
- The Dockerfile builds on `BUILDPLATFORM` and cross-compiles to
  `TARGETARCH`. Do not remove the platform override: building the Go toolchain
  under target emulation makes multi-arch releases extremely slow.

## Documentation

- Root [`AGENTS.md`](../../AGENTS.md).
- [`deploy/README.md`](../../deploy/README.md).
- [`docs/runbook.md`](../../docs/runbook.md) and
  [`docs/decisions.md`](../../docs/decisions.md).
