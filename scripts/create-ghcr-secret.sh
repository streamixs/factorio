#!/usr/bin/env bash
set -euo pipefail

: "${GHCR_USERNAME:?Set GHCR_USERNAME to your GitHub username}"
: "${GHCR_TOKEN:?Set GHCR_TOKEN to a classic PAT with read:packages}"

for namespace in factorio-system agent-system; do
  kubectl -n "$namespace" create secret docker-registry ghcr-pull \
    --docker-server=ghcr.io \
    --docker-username="$GHCR_USERNAME" \
    --docker-password="$GHCR_TOKEN" \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  echo "Updated ghcr-pull in $namespace"
done
