#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  TAG="main-$(git rev-parse --short=7 HEAD)"
fi

OWNER="$(gh repo view --json owner --jq '.owner.login')"
REGISTRY="ghcr.io/$OWNER"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Public packages can be verified anonymously. Private packages need the
# ghcr-pull secret on the cluster, and may or may not have a local docker login.
public=true
for image in api web agent; do
  reference="$REGISTRY/factorio-$image:$TAG"
  if ! DOCKER_CONFIG="$TMP_DIR" docker manifest inspect "$reference" >/dev/null 2>&1; then
    public=false
    break
  fi
done

if [[ "$public" != "true" ]]; then
  for namespace in factorio-system agent-system; do
    if ! kubectl -n "$namespace" get secret ghcr-pull >/dev/null 2>&1; then
      echo "The GHCR images are private (or the tag does not exist) and secret ghcr-pull is missing in $namespace." >&2
      echo "If the organization disables public packages, create a classic PAT with read:packages and run:" >&2
      echo "  GHCR_USERNAME=<user> GHCR_TOKEN=<pat> make ghcr-secret" >&2
      exit 1
    fi
  done

  # A local docker login is optional: the cluster pulls with ghcr-pull.
  for image in api web agent; do
    reference="$REGISTRY/factorio-$image:$TAG"
    if ! docker manifest inspect "$reference" >/dev/null 2>&1; then
      echo "Note: could not verify $reference locally; the cluster will pull it with ghcr-pull." >&2
      break
    fi
  done
fi

if ! kubectl -n factorio-system get secret factorio-auth >/dev/null 2>&1; then
  echo "Missing Secret factorio-auth in factorio-system." >&2
  echo "Run 'make -C deploy auth-secret' or create it from deploy/README.md." >&2
  exit 1
fi

echo "Deploying $TAG from $REGISTRY"
make -C apps/agent deploy IMG="$REGISTRY/factorio-agent:$TAG"
make -C deploy deploy \
  TAG="$TAG" \
  API_IMG="$REGISTRY/factorio-api:$TAG" \
  WEB_IMG="$REGISTRY/factorio-web:$TAG"
