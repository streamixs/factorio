# Contributing

Thanks for improving the Factorio platform. This file is the short entry point;
the detailed rules are in:

- [`AGENTS.md`](AGENTS.md) — repository map, commands and task recipes.
- [`docs/working-agreements.md`](docs/working-agreements.md) — planning,
  branches, reviews, agents and definitions of ready/done.
- [`docs/github.md`](docs/github.md) — labels, milestones, project fields and
  issue templates.
- [`docs/roadmap.md`](docs/roadmap.md) — current themes and release horizons.
- [`SECURITY.md`](SECURITY.md) — security model and private disclosure.

## Setup

```sh
make install
make check
make audit
```

`make check` runs the version check, lint, tests and builds. Build
`libs/shared` before running API or web tests directly.

## Before opening an issue

- Search the existing issues and the roadmap.
- Use an issue template.
- State the outcome, scope, acceptance criteria and affected areas.
- Do not open a public issue for a vulnerability; use the private advisory flow
  in [`SECURITY.md`](SECURITY.md).

## Before opening a pull request

1. Link the issue with `Closes #<number>`.
2. Keep the change focused; split refactors, dependency updates and features.
3. Use a conventional commit title (`feat(scope): ...`, `fix(scope): ...`).
4. Run `make check` and `make audit`.
5. Fill the pull request template, including the deployment section.
6. Do not commit secrets, tokens, kubeconfigs or generated files.

Pull requests are squash-merged. The pull request title becomes the commit.

## Conventions

- Code, comments, identifiers, commits, issues and documentation are in
  English.
- User-facing UI text and UI error messages are in French.
- Shared types and Zod schemas live in `libs/shared` and are defined before the
  API or web consumes them.
- Go code must pass `go fmt` and `golangci-lint`; run `make -C apps/agent fmt
  lint test`.
- Next.js 16 has breaking changes; read `apps/web/AGENTS.md` and the relevant
  guide under `apps/web/node_modules/next/dist/docs/` before writing UI code.
- Do not deploy without an explicit request. A deployment restarts running
  Factorio servers.
