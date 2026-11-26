#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: ./scripts/release.sh X.Y.Z" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Release from main, not $(git branch --show-current)." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean." >&2
  exit 1
fi

git fetch origin main --tags --prune

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "Local main is not at origin/main. Pull or push first." >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
  echo "Tag v$VERSION already exists." >&2
  exit 1
fi

echo "Running make check before v$VERSION..."
make check

if [[ -n "$(git status --porcelain)" ]]; then
  echo "make check changed the working tree; review and rerun." >&2
  exit 1
fi

node scripts/set-version.mjs "$VERSION"
node scripts/check-version.mjs

if [[ -n "$(git status --porcelain)" ]]; then
  git add VERSION package.json apps/api/package.json apps/web/package.json libs/shared/package.json
  git commit -m "chore(release): v$VERSION"
else
  echo "Version already $VERSION; tagging the current commit."
fi

git tag -a "v$VERSION" -m "Factorio Platform v$VERSION"
git push origin main
git push origin "v$VERSION"

echo "Released v$VERSION. The release workflow builds GHCR images and creates the GitHub Release."
