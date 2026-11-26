# Working agreements

How we plan, split, execute, review and remember work. Read this before opening
an issue or starting an agent.

## Core principles

1. **Separate ideas, decisions, tasks and execution.** Each kind of information
   has one home.
2. **One issue, one branch, one worktree, one pull request.** No mixed scopes.
3. **Contract first.** CRD, shared-type and API changes land in their own PR
   before parallel implementation starts.
4. **Small vertical slices.** A change should be testable and deployable on its
   own.
5. **Agents implement; humans decide and release.** No agent deploys or creates
   a release.
6. **Do not rely on chat history.** Promote durable context to an issue, an ADR
   or a runbook.

## Work item lifecycle

```text
Idea → Draft → Epic → Sub-issue → Ready → In progress
     → In review → Done → Release → Learn
```

Use the project status as the source of truth for execution:

| Status | Meaning |
|---|---|
| **Backlog** | Accepted idea, not scheduled. |
| **Ready** | Refined enough for an agent or a human to start. |
| **In progress** | Assigned, branch and worktree created. |
| **In review** | Pull request open or under review. |
| **Done** | Merged and, when relevant, released. |
| **Parked** | Deliberately deferred with a reason and a revisit condition. |

Do not duplicate the status in labels.

## Where information lives

| Information | Location |
|---|---|
| Direction and themes | [`roadmap.md`](roadmap.md) |
| Raw or unrefined idea | Project draft or Backlog item |
| Outcome for an epic | Epic issue |
| Actionable work | Sub-issue with acceptance criteria |
| Durable decision | Entry in [`decisions.md`](decisions.md) |
| Execution state | Project status |
| Taxonomy | Labels and project fields |
| Release window | Milestone |
| Operations knowledge | [`runbook.md`](runbook.md) |
| Security policy | [`../SECURITY.md`](../SECURITY.md) |

## Definition of Ready

An issue may move to **Ready** only when it has:

- [ ] a context and an expected outcome;
- [ ] a scope and explicit non-goals;
- [ ] acceptance criteria;
- [ ] the affected areas (`agent`, `api`, `web`, `deploy`, `ci`, `docs`);
- [ ] a test plan;
- [ ] rollout and rollback notes when the change is risky;
- [ ] dependencies and contracts identified;
- [ ] no unresolved design question.

Add the `agent-ready` label only after these points are covered.

## Definition of Done

- [ ] `make check` passes.
- [ ] `make audit` passes.
- [ ] Tests cover new pure logic and risky behavior.
- [ ] Documentation, ADR and runbook are updated when behavior changes.
- [ ] The pull request template is filled.
- [ ] No unrelated change and no generated file is committed by accident.
- [ ] The issue is closed with a resolution comment (done, parked, duplicate or
      won't do).

## Naming conventions

| Object | Convention | Example |
|---|---|---|
| Epic | `[Epic] <area>: <outcome>` | `[Epic] Backups: durable off-site recovery` |
| Issue | `<area>: <imperative outcome>` | `backups: replicate saves to S3 with restic` |
| ADR | `adr: <decision>` | `adr: choose the backup target and RPO` |
| Branch | `<type>/<issue>-<slug>` | `feat/123-offsite-backups` |
| Worktree | `issue-<number>-<slug>` | `issue-123-offsite-backups` |
| PR | Conventional commit title | `feat(backups): replicate saves to S3` |

Branch types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`,
`security`.

Use English for code, comments, commits, issues, ADRs and documentation. Use
French for user-facing UI text.

## Pull requests

- Link the issue with `Closes #<number>`.
- Keep the change focused; split refactors, dependency updates and features.
- Use squash merge only; the PR title becomes the commit.
- Delete the branch after merge.
- A human merges the PR. A reviewer agent may approve it, but does not replace
  the human decision.
- Do not merge with failing checks. On a private repository without required
  checks, keep the CI job names stable so they can be required later.

## Agent workflow

### Roles

| Role | Responsibility |
|---|---|
| **Planner / architect** | Break down epics, write ADRs and contracts, define acceptance criteria. Does not implement. |
| **Implementer** | One issue per worktree; code, tests and docs; opens the PR. |
| **Reviewer** | Independent review, runs the checks, looks for regressions, security issues and missing tests. |
| **Release / ops** | Updates the runbook and release notes, verifies images, tags the release. |

### Rules

- One issue per worktree and branch. Use the issue number in both names.
- Claim the issue before starting: assign it, set **In progress**, create the
  branch.
- Maximum three implementers in parallel and one reviewer.
- Do not run two agents on the same files without a contract-first PR.
- Agents must not deploy, rotate production secrets, or create a release.
- Agents must not commit secrets or edit generated files by hand.
- Agents run `make check` and `make audit` before opening the PR.
- On handoff, leave an issue comment with: what changed, what remains, tests
  run, risks and links.

### Suggested prompt skeleton

```text
Issue: <URL>
Scope: <what to implement and what not to touch>
Allowed areas: <files/directories>
Contracts: <ADR or shared types to respect>
Acceptance criteria: <checklist>
Commands: make check, make audit
Constraints: no deployment, no secrets, no generated files, keep UI French
Deliverable: PR linked to the issue
Report: summary, tests, risks, follow-ups
```

## Review checklist

- The diff matches the issue and does not include unrelated changes.
- New pure logic has a test.
- Error paths, retries, timeouts and rollback are considered.
- No secret, token or personal data is logged or committed.
- API validation uses the shared Zod schemas.
- CRD and generated files are regenerated, not hand-edited.
- The UI remains French and hydration is verified for route changes.
- Documentation and the runbook are updated.

## Memory and review rituals

- **Weekly planning:** review Now/Next, move one to three issues to Ready,
  assign owners, unblock.
- **Weekly close:** merge, update the roadmap, release when the milestone is
  ready.
- **Monthly garden:** review parked items and their revisit condition, close
  stale ideas, review dependencies and security findings.
- **Per release:** check the milestone exit criteria, publish notes, verify the
  images and the deployment.

### Parking work

Parking is a decision, not a failure. A parked item keeps:

- the reason it was deferred;
- a revisit date or a concrete trigger;
- a link to the blocking decision or dependency.

Use the `parked` label and the project **Parked** view. If an item has no
revisit condition after a monthly review, close it as won't do.

## Security and secrets

- Report vulnerabilities through a private security advisory, never a public
  issue. See [`../SECURITY.md`](../SECURITY.md).
- Never commit a token, password, kubeconfig or generated credential.
- Rotate a secret by updating the Kubernetes Secret and restarting the
  consumers; do not put secrets in a CR or a ConfigMap.
- Treat the API bearer token and the RCON password as production credentials.

## Related documents

- [Roadmap](roadmap.md)
- [GitHub conventions](github.md)
- [Architecture decisions](decisions.md)
- [Runbook](runbook.md)
- [Release process](release.md)
- [Agent guide](../AGENTS.md)
