# Deployment

Runs the API and the web UI inside Kubernetes. `make deploy` and
`make deploy-local` at the repository root also install the agent and its CRDs.
For an agent-only deploy, use `apps/agent: make install && make deploy`.

Vue d’ensemble : [`../README.md`](../README.md). Exploitation et dépannage :
[`../docs/runbook.md`](../docs/runbook.md). Releases et images GHCR :
[`../docs/release.md`](../docs/release.md).

## Deployment paths

### Published GHCR images (recommended)

From the repository root:

```sh
make deploy                  # current main image: main-<short-sha>
make deploy TAG=v0.4.0       # release image
```

The `make deploy` target resolves
`ghcr.io/<owner>/factorio-{api,web,agent}:<tag>`, checks that the images are
reachable, and deploys the agent first, then the API and web. The tag defaults
to `main-<short-sha>` for the current commit.

Every push to `main` publishes `main` and `main-<short-sha>`. Tags publish the
immutable `vX.Y.Z` image used by releases.

The GHCR packages must be public, or the `ghcr-pull` secret must exist in
`factorio-system` and `agent-system`. Repository visibility does not change
package visibility; see
[`../docs/release.md`](../docs/release.md#ghcr-visibility).

### Local development images

From the repository root:

```sh
make deploy-local
```

This builds `factorio-api:dev`, `factorio-web:dev` and `factorio-agent:dev`,
then deploys them. They are available to OrbStack's Kubernetes. For another
cluster, push them to a registry and pass the full image references.

The equivalent manual flow from this directory remains:

```sh
make build
make deploy
```

`make deploy` from this directory still deploys local images; the root
`make deploy` uses GHCR.

Open the UI:

```sh
make port-forward   # http://localhost:3000
```

The Next server proxies `/api/*` to the `factorio-api` Service, so the browser
only needs to reach the web Service.

## Authentication

The API requires an internal bearer token; the web server injects it and the
browser never sees it. Create the shared Secret before deploying:

```sh
make auth-secret
```

This creates `factorio-auth` with a random API token and prints the generated
web username/password (used by the web Basic auth). To set your own values:

```sh
kubectl -n factorio-system create secret generic factorio-auth \
  --from-literal=web-user=admin \
  --from-literal=web-password='...' \
  --from-literal=api-token="$(openssl rand -hex 32)"
```

`make deploy` refuses to run if the Secret is missing. Rotating the API token
requires restarting both the API and web deployments so they pick up the new
value.

The web UI uses HTTP Basic auth. Use TLS for any access beyond localhost or a
local port-forward: browsers cache Basic credentials and send them on every
request.

## Namespace

The API manages `FactorioServer` resources in the `default` namespace. To
target another namespace, change:

- `deploy/api-rbac.yaml`: the `Role` and `RoleBinding` namespace.
- `deploy/api.yaml`: `FACTORIO_NAMESPACE`.

The web and API deployments themselves live in `factorio-system`.

## What the API needs

The Role in the target namespace allows:

- `factorioservers` CRUD
- `factoriooperations` create/list/watch (durable restore/import)
- `persistentvolumeclaims` get/update/patch (detach the data volume when deleting with `keepStorage`)
- `secrets` get/create/update/delete (managed credentials and RCON)
- `configmaps` get (effective settings)
- `customresourcedefinitions` get cluster-wide (settings form schema)
- `storageclasses` get/list cluster-wide (StorageClass picker)
- `pods` list and `pods/log` get (logs)
- `events` list (diagnostics)
- `services` get (connection details)
- `metrics.k8s.io/pods` get/list (CPU and memory)
- `nodes` get/list cluster-wide (NodePort addresses)

The agent runs the restore/import Jobs and owns the suspend/resume state
machine; the API only creates `FactorioOperation` resources.

The API does not need `deployments` or pod write access; the agent owns those
resources.

## Import uploads

Uploaded saves are stored in `/var/lib/factorio/imports` on the
`factorio-api-imports` PersistentVolumeClaim (5Gi, `ReadWriteOnce`). The API
deployment uses the `Recreate` strategy because only one pod can mount that
volume at a time. Scaling the API horizontally requires a `ReadWriteMany`
volume or object storage.

Imports and their metadata expire after 30 minutes and are pruned
automatically. Keeping them on the volume means an import survives an API
restart while the operation Job is running.

Before writing, the API checks the import volume free space and keeps a 256 MiB
safety margin. A write that hits `ENOSPC` is rejected with a clear error instead
of an internal server error.

## Data retention

- The agent keeps the three newest `pre-restore-*` and `pre-import-*` copies
  per server. The operation Job prunes older copies after installing the save.
- Terminal `FactorioOperation` resources are kept for 7 days for diagnostics,
  then deleted by the agent. Their Jobs are deleted as soon as they finish.
- Factorio autosaves are capped by `server.autoSave.slots` in the settings.
- The backups tab shows the saves directory size and the data volume usage.

Deleting a server with “Conserver les données” detaches its PVC and marks it
with `games.dev.streamixs.com/keep-pvc: "true"`. The agent adopts the claim when
a server with the same name is created again. A kept volume that is never
reused can be removed manually:

```sh
kubectl -n default delete pvc <name>-data
```

## Secrets

The agent re-renders a server's settings every 10 minutes. A rotated Secret
referenced by the server, or an owned Secret that was recreated, is therefore
picked up without waiting for an unrelated server event. The Factorio and
operation pods do not automount a Kubernetes service account token, and the web
pod does not either.

## Network policies

`deploy/network-policies.yaml` limits the attack surface:

- the API accepts traffic only from pods labeled `app=factorio-web` in
  `factorio-system`;
- Factorio pods accept UDP 34197 from anywhere so players can connect;
- saves (8080) and RCON (27015) accept traffic only from the API pods.

The game policy is written for the `default` namespace. If you change
`FACTORIO_NAMESPACE`, move that policy to the same namespace. Enforcement
depends on the cluster CNI; verify from a pod outside `factorio-system` that
the API is unreachable.

The import download URL is a short-lived signed URL (random token, 30-minute
TTL). It is the only API route besides health that does not require the bearer
token, so the operation Job can fetch the uploaded save. NetworkPolicy limits
that route to web and operation pods.

## Audit

RCON commands are logged with the server name and a truncated,
whitespace-normalized command. Passwords and command output are never logged.

## Metrics

The Connection tab reads CPU and memory from `metrics-server`. On OrbStack the
kubelet certificate is self-signed, so the component needs
`--kubelet-insecure-tls`:

```sh
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl -n kube-system patch deployment metrics-server --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

Without `metrics-server` the UI still works; the load card shows
"métriques indisponibles".

## Ingress

For a real cluster, expose the web Service with an Ingress or a LoadBalancer.
Do not expose the API directly: the web proxies it, and the API only accepts
the internal bearer token.
