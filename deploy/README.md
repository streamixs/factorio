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

## Namespace

The API manages `FactorioServer` resources in the `default` namespace. To
target another namespace, change:

- `deploy/api-rbac.yaml`: the `Role` and `RoleBinding` namespace.
- `deploy/api.yaml`: `FACTORIO_NAMESPACE`.

The web and API deployments themselves live in `factorio-system`.

## What the API needs

The Role in the target namespace allows:

- `factorioservers` CRUD
- `secrets` get/create/update/delete (managed credentials)
- `configmaps` get (effective settings)
- `pods` list and `pods/log` get (logs)
- `events` list (diagnostics)

The API does not need `services`, `deployments` or pod write access; the agent
owns those resources.

## Ingress

For a real cluster, expose the web Service with an Ingress or a LoadBalancer.
Do not expose the API directly: the web proxies it, and the API has no
authentication yet.
