# Roadmap

This roadmap is the durable memory of the platform direction. It lists themes
and outcomes, not individual tasks. Actionable work lives in GitHub issues and
the project board; decisions live in [`decisions.md`](decisions.md).

## Principles

- Reliability and data safety before new features.
- Security and least privilege by default.
- Small vertical slices; define the contract before parallel work.
- One source of truth for each kind of information.
- Agents can implement; humans decide, review and release.

## How to use this file

- An **epic** describes an outcome and links its sub-issues.
- A **sub-issue** is one testable piece of work, ready for an agent.
- A **milestone** is a release window, not a theme.
- Ideas that are not ready live in the project backlog or as drafts; parked
  items keep a revisit condition.
- Do not add a task list to this file. When a theme becomes actionable, create
  an epic and its sub-issues.

## Now — v0.4.0 Reliable operations

| Theme | Outcome |
|---|---|
| Durable backups | Saves are replicated off-site with encryption and retention, and a restore drill is automated. |
| Access security | The web is behind TLS with security headers and rate limiting; OIDC follows. |
| Isolation | Game workloads run outside `default` with least-privilege RBAC, egress NetworkPolicies and restricted pod security. |
| Audit and observability | API/agent mutations and RCON commands produce structured audit events; metrics and alerts cover the critical paths. |
| Supply chain and regressions | CI blocks high or reachable vulnerabilities and runs the critical browser flows. |

**Exit criteria:** a save has been restored end-to-end from the off-site copy;
the UI and API are reachable over TLS; the API manages a dedicated namespace
with scoped RBAC; CI covers security scans and the critical user journeys.

## Next — v0.5.0 Server experience

| Theme | Outcome |
|---|---|
| Mods | Search, install, update and configure mods from the Mod Portal, with compatibility warnings. |
| Players | Online players, whitelist, ban and admin lists, kick/ban actions and RCON command history. |
| Scheduled operations | Restarts, backups, save cleanup and Factorio version upgrades on a schedule. |
| Notifications | Discord, webhook or email notifications for server and operation events. |
| Metrics and templates | UPS, players, research and evolution in the UI; server templates and cloning. |
| Identity | OIDC and roles if they were not delivered with the access-security theme. |

**Exit criteria:** an operator can run the full server lifecycle from the UI,
without `kubectl`, and can be notified of failures.

## Later — v1.0.0 Platform

- Multi-user teams and per-server permissions.
- HA for the agent, API and web; PDB, quotas and anti-affinity.
- GitOps with dev/staging/production overlays.
- Disaster recovery across clusters, registry mirroring and upgrade strategy.
- Performance, accessibility and internationalization.

## Not doing now

- Multi-tenant SaaS or billing.
- Per-component version matrices; the platform keeps one SemVer.
- Agent-driven deployments or releases.
- Public vulnerability issues; use private security advisories.

## Review cadence

- **Weekly:** move one to three items to Ready, unblock work, update
  Now/Next.
- **Monthly:** review the parked items, dependencies, security findings and
  this roadmap.
- **Per release:** verify the milestone exit criteria and update the roadmap.

## Related documents

- [Working agreements](working-agreements.md)
- [GitHub conventions](github.md)
- [Architecture decisions](decisions.md)
- [Runbook](runbook.md)
- [Release process](release.md)
- [Security policy](../SECURITY.md)
