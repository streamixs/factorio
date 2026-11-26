# GitHub conventions

Reference for labels, milestones, project fields, views and issue templates.
The workflow itself is in [`working-agreements.md`](working-agreements.md).

## One project, several views

Use a single GitHub Project named **Factorio Platform**. Do not create separate
projects for roadmap, backlog and bugs.

### Fields

| Field | Type | Values |
|---|---|---|
| **Status** | Single select | Backlog, Ready, In progress, In review, Done, Parked |
| **Area** | Single select | Agent, API, Web, Deploy, CI, Docs, Cross-cutting |
| **Horizon** | Single select | Now, Next, Later |
| **Size** | Single select | S, M, L |
| **Priority** | Single select | P0, P1, P2, P3 |
| **Agent** | Text | Human or agent currently owning the item |
| **Revisit** | Date | Review date for parked items |

The milestone is the release window. Do not add a duplicate `Target release`
field unless a real need appears.

### Views

| View | Purpose |
|---|---|
| **All items** | Everything in the project, for search and cleanup. |
| **Now** | Items for the current wave (`horizon:Now`). |
| **Next** | Items planned for the following wave (`horizon:Next`). |
| **Later** | Deferred but not parked (`horizon:Later`). |
| **Parked** | Deferred items with a revisit condition (`status:Parked`). |
| **Agent queue** | Ready items with `agent-ready` and no assignee. |
| **Roadmap** | Active items, grouped by milestone for release planning. |
| **Blocked** | Items with `blocked` or an open dependency. |
| **Recently done** | Recently completed items, for the weekly review. |

### Project setup

The project is created at
<https://github.com/orgs/streamixs/projects/1> and linked to the repository.
Its fields, status options and views are configured. The remaining UI-only
settings are:

1. In the **Roadmap** view, group by **Milestone** and use the milestone target
   dates.
2. In **Agent queue**, sort by priority; in **Recently done**, sort by the
   last update.
3. Enable the built-in workflows: auto-add issues and pull requests, set
   **Done** when an item closes, and set **In review** when a pull request is
   linked.

## Labels

Labels are taxonomy, not execution state. Keep them stable; change the project
status instead.

### Area

| Label | Use |
|---|---|
| `area/agent` | Go controller, CRDs, reconciliation. |
| `area/api` | NestJS API, validation, Kubernetes access. |
| `area/web` | Next.js UI, proxy, theme. |
| `area/deploy` | Manifests, networking, ingress, operations. |
| `area/ci` | GitHub Actions, dependency and supply-chain checks. |
| `area/docs` | Documentation, ADRs, runbooks. |

### Kind

| Label | Use |
|---|---|
| `kind/feature` | New user-facing capability. |
| `kind/bug` | Broken or unsafe behavior. |
| `kind/security` | Hardening or vulnerability fix. |
| `kind/reliability` | Backups, recovery, resilience, operations. |
| `kind/tech-debt` | Refactor, cleanup, internal improvement. |
| `kind/adr` | Architecture decision record. |

### Size and priority

| Label | Use |
|---|---|
| `size/S` | One sitting. |
| `size/M` | A few sessions. |
| `size/L` | Split into sub-issues. |
| `priority/P0` | Urgent production or security impact. |
| `priority/P1` | High impact, current wave. |
| `priority/P2` | Important, later wave. |
| `priority/P3` | Nice to have, no commitment. |

### Workflow markers

| Label | Use |
|---|---|
| `agent-ready` | Definition of Ready is satisfied. |
| `needs-design` | An ADR or contract is required first. |
| `blocked` | Waiting on another issue or an external decision. |
| `parked` | Deferred; the issue states the revisit condition. |

The generic GitHub labels (`bug`, `enhancement`, `documentation`, `question`,
etc.) and the Dependabot labels remain for compatibility. New work uses the
`area/*` and `kind/*` taxonomy. Do not delete the Dependabot labels while the
bot uses them.

## Milestones

Milestones are release windows, not themes.

| Milestone | Scope |
|---|---|
| **v0.4.0 — Server experience** | Players and live metrics first, then mods, scheduled operations, notifications and templates. |
| **v0.5.0 — Reliable operations** | Off-site backups and tested restores, TLS and rate limiting, namespace/RBAC, audit log, observability, supply chain, E2E. |
| **v1.0.0 — Platform** | OIDC/multi-user, HA, GitOps, DR, performance, accessibility, i18n. |

No due date is set until a release is actually planned. The milestone
description lists its exit criteria.

## Issue templates

The repository provides:

| Template | Prefix | Labels |
|---|---|---|
| Feature or task | `feat:` | `kind/feature` |
| Bug | `fix:` | `kind/bug` |
| Architecture decision | `adr:` | `kind/adr`, `needs-design` |
| Reliability or operations | `reliability:` | `kind/reliability` |

Security vulnerabilities use the private advisory flow, never a public issue.
Blank issues are disabled so every item carries enough context.

## Issue dependencies

Use GitHub's native issue dependencies when available (`blocked by` / `blocks`).
Otherwise:

- add the `blocked` label;
- add a **Dependencies** section to the issue body;
- link the blocking issue or decision.

The **Blocked** view must stay short. If an item is blocked for a month, park it
with a revisit condition.

## Naming

| Object | Convention |
|---|---|
| Epic | `[Epic] <area>: <outcome>` |
| Issue | `<area>: <imperative outcome>` |
| Branch | `<type>/<issue>-<slug>` |
| Worktree | `issue-<number>-<slug>` |
| PR | Conventional commit title |

The full rules and examples are in
[`working-agreements.md`](working-agreements.md#naming-conventions).

## Labels and milestones as code

Labels and milestones were created with the GitHub CLI. To reproduce or update
a label:

```sh
gh label create "area/web" \
  --description "Work on the Next.js UI" \
  --color 5319e7 \
  --force
```

To create a milestone:

```sh
gh api --method POST repos/streamixs/factorio/milestones \
  -f "title=v0.4.0 — Reliable operations" \
  -f "description=Off-site backups and tested restores, TLS, RBAC, audit, observability and supply chain."
```

Do not create a task list here. Create issues only when they are ready to be
worked on, and keep the roadmap focused on outcomes.
