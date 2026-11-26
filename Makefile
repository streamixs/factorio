SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

TAG ?= main-$(shell git rev-parse --short=7 HEAD)

.PHONY: help install lint lint-api lint-web lint-agent test test-api test-web test-agent build build-shared build-api build-web build-agent check audit fmt docker deploy deploy-local version version-check release

help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Setup

install: ## Install pnpm dependencies and build the shared package.
	pnpm install
	pnpm --filter @factorio/shared build

##@ Quality

lint: lint-api lint-web lint-agent ## Lint API, web and agent.

lint-api: ## Format-check and lint the API.
	pnpm --filter @factorio/api format:check
	pnpm --filter @factorio/api lint

lint-web: ## Lint the web app.
	pnpm --filter @factorio/web lint

lint-agent: ## Lint the Go agent.
	$(MAKE) -C apps/agent lint

test: build-shared ## Run API, web and agent tests.
	pnpm --filter @factorio/api test
	pnpm --filter @factorio/web test
	$(MAKE) -C apps/agent test

test-api: build-shared ## Run API tests.
	pnpm --filter @factorio/api test

test-web: build-shared ## Run web tests.
	pnpm --filter @factorio/web test

test-agent: ## Run agent tests (envtest).
	$(MAKE) -C apps/agent test

build: build-shared ## Build API, web and agent.
	pnpm --filter @factorio/api build
	pnpm --filter @factorio/web build
	$(MAKE) -C apps/agent build

build-shared: ## Build the shared TypeScript package.
	pnpm --filter @factorio/shared build

build-api: build-shared ## Build the API.
	pnpm --filter @factorio/api build

build-web: build-shared ## Build the web app.
	pnpm --filter @factorio/web build

build-agent: ## Build the Go agent.
	$(MAKE) -C apps/agent build

check: version-check lint test build ## Reference check: versions, lint, tests and builds.

audit: ## Run npm and Go vulnerability scans.
	pnpm audit --audit-level high
	$(MAKE) -C apps/agent vulncheck

fmt: ## Format the API and the agent.
	pnpm --filter @factorio/api format
	$(MAKE) -C apps/agent fmt

##@ Images

docker: ## Build the local :dev API, web and agent images.
	$(MAKE) -C apps/agent docker-build IMG=factorio-agent:dev
	$(MAKE) -C deploy build

deploy: ## Deploy published GHCR images (TAG defaults to main-<sha>).
	./scripts/deploy-ghcr.sh $(TAG)

deploy-local: ## Build and deploy local :dev images.
	$(MAKE) docker
	$(MAKE) -C apps/agent deploy IMG=factorio-agent:dev
	$(MAKE) -C deploy deploy TAG=dev API_IMG=factorio-api:dev WEB_IMG=factorio-web:dev

##@ Release

version: ## Print the platform version.
	@cat VERSION

version-check: ## Verify VERSION, package versions and the Git tag are consistent.
	node scripts/check-version.mjs

release: ## Release a SemVer version: make release VERSION=0.1.0.
	@test -n "$(VERSION)" || { echo "Usage: make release VERSION=x.y.z"; exit 1; }
	./scripts/release.sh $(VERSION)
