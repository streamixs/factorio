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

for image in api web agent; do
  reference="$REGISTRY/factorio-$image:$TAG"
  if ! docker manifest inspect "$reference" >/dev/null 2>&1; then
    echo "Missing or inaccessible image: $reference" >&2
    echo "Build and publish it first, make the GHCR packages public, or run 'docker login ghcr.io'." >&2
    exit 1
  fi
done

# The cluster needs the ghcr-pull secret when the packages are private.
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
      echo "The images are private and secret ghcr-pull is missing in $namespace." >&2
      echo "Make the three GHCR packages public, or create the pull secret." >&2
      exit 1
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
