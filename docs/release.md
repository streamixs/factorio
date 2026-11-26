# Release process

The platform uses a single SemVer version stored in [`../VERSION`](../VERSION).
Git tags are `vX.Y.Z`. The first release is `v0.1.0`.

The CRD API version `v1alpha1` is the Kubernetes schema version and is **not**
the platform release version.

## Prerequisites

- clean `main`, up to date with `origin/main`;
- Node.js (for the version scripts) and the usual local toolchain;
- `git` push access to the repository.

No GitHub token is needed locally: the release script runs `make check` and
pushes the commit and annotated tag; the tag triggers the GitHub Actions
release workflow.

## Release a version

```sh
make release VERSION=0.1.0
```

The script:

1. validates the SemVer string, branch, clean tree and absent tag;
2. checks that local `main` equals `origin/main`;
3. runs `make check` (version check, lint, tests, builds);
4. updates `VERSION` and the four `package.json` versions;
5. creates `chore(release): vX.Y.Z` if the versions changed;
6. creates the annotated tag `vX.Y.Z`;
7. pushes `main` and the tag.

If the versions already match (for example the first `v0.1.0` release), the
script tags the current commit without an empty release commit.

## What the tag workflow does

`.github/workflows/release.yml` runs on `v*` tags:

- verifies `VERSION` equals the tag without the `v`;
- builds multi-arch images (`linux/amd64,linux/arm64`) for:
  - `ghcr.io/<owner>/factorio-api`
  - `ghcr.io/<owner>/factorio-web`
  - `ghcr.io/<owner>/factorio-agent`
- publishes tags:
  - `vX.Y.Z`
  - `X.Y`
  - `latest`
  - `sha-<short>`
- verifies the published images are pullable, multi-arch and that the agent
  binary reports the tag;
- creates the GitHub Release with auto-generated notes;
- builds the agent `install.yaml` with the released image and attaches it to
  the release.

The workflow needs `contents: write` and `packages: write`, already declared in
the workflow. It uses the repository `GITHUB_TOKEN`.

## Main-branch images

Every push to `main` also publishes development images from the CI Docker job:

- `ghcr.io/<owner>/factorio-api:main` and `:main-<short-sha>`
- `ghcr.io/<owner>/factorio-web:main` and `:main-<short-sha>`
- `ghcr.io/<owner>/factorio-agent:main` and `:main-<short-sha>`

The image is built with `APP_VERSION=main-<short-sha>` (or `VERSION` for the
agent), so the sidebar and the agent report the exact commit. These tags are
for development and testing; releases keep the immutable `vX.Y.Z` tag.
`make deploy` defaults to `main-<short-sha>` for the current commit.

## Deploy a release

```sh
make deploy TAG=v0.4.0
```

The script resolves the three GHCR images, checks their availability and the
pull access, then deploys the agent, API and web. It refuses to continue if a
required image or the `factorio-auth` Secret is missing.

Verify:

```sh
# Web liveness
curl -s http://localhost:3000/health

# API version
kubectl -n factorio-system port-forward svc/factorio-api 3001:3001
curl -s http://localhost:3001/health
```

The API health response and the sidebar version must show `vX.Y.Z`. The agent logs
`version=vX.Y.Z` at startup and supports:

```sh
docker run --rm ghcr.io/<owner>/factorio-agent:vX.Y.Z --version
```

## GHCR visibility

The workflow pushes to GHCR. **Repository visibility does not change package
visibility**: a public repository can still have private container packages.
Choose one:

- make the three GHCR packages public; or
- keep them private and create the `ghcr-pull` image pull secret.

To make a package public: open the organization or user **Packages** page,
select the package, open **Package settings**, then **Danger Zone → Change
visibility → Public**. Repeat for `factorio-api`, `factorio-web` and
`factorio-agent`.

`make deploy` verifies anonymous access first. If the packages are private it
requires `ghcr-pull` in both namespaces. The API, web and agent Deployments
reference that secret; a missing secret only logs a warning and does not block
local `:dev` images. For private packages, create it in both namespaces:

```sh
kubectl -n factorio-system create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=<user> \
  --docker-password=<PAT-with-read:packages>
kubectl -n agent-system create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=<user> \
  --docker-password=<PAT-with-read:packages>
```

## Rollback

Deploy the previous tag with the same command:

```sh
make deploy TAG=v0.3.0
```

The database is the Kubernetes CRDs and PVCs; no schema migration is performed
by a release. A CRD change must be called out in the release notes.

## Hotfix

Create a normal PR with the fix, merge it, then release a patch:

```sh
make release VERSION=0.1.1
```

## Local development

Local images keep `:dev` tags and the `dev` version:

```sh
make deploy-local
```

This builds and deploys `factorio-{api,web,agent}:dev`. Main-branch images use
`main-<short-sha>`; only tagged releases get immutable `vX.Y.Z` tags.
