# Deployment

Runs the API and the web UI inside Kubernetes. The agent and its CRDs must
already be installed (`apps/agent: make install && make deploy`).

## Build and deploy

From this directory:

```sh
make build
make deploy
```

Images are built locally (`factorio-api:dev`, `factorio-web:dev`) and are
available to OrbStack's Kubernetes. For another cluster, push them to a
registry and pass `TAG`/`API_IMG`/`WEB_IMG` to `make deploy`.

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
Do not expose the API directly: the web proxies it, and the API has no
authentication yet.
