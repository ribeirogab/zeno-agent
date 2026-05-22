---
tags:
  - rule
  - workflow
  - architecture
severity: important
applies-to:
  - apps/dashboard/
  - apps/api/
  - apps/cli/
  - packages/db/
created: 2026-05-22
---
# CLI is the only mutation surface

All configuration and state changes in Zeno happen through the `zeno` CLI. The dashboard renders state — it never mutates it. The HTTP API exposed to the dashboard is read-only.

This applies to: profiles, connectors (install/uninstall, secrets, capability toggles), crons (create/edit/delete/pause), skills (install/uninstall), backend credentials, channel setup, and any future configuration surface.

## Why

- **One control plane, not two.** A CLI + dashboard that both mutate the same state drift. Two ways to do the same thing means two sets of bugs, two validation paths, and twice the surface to keep in sync with the DB schema.
- **Scriptable by default.** Personal-agent ergonomics live and die on automation. Anything that requires clicking through a web UI is a step a human has to do; anything in the CLI can go in a shell script, a Justfile, a cron, or another agent's plan.
- **Auditable.** CLI invocations are shell history; web clicks are not. Every mutation having a recoverable command makes "what changed and when" answerable from the operator's terminal.
- **Smaller blast radius.** A read-only dashboard cannot be tricked (CSRF, session-hijack, prompt-injection of a connector that reaches the dashboard origin) into changing state. The dashboard becomes a viewer with much weaker capability requirements.
- **Forces the CLI to be the real product.** If you cannot do something from `zeno`, the CLI is incomplete — that gap is visible and fixable. If the dashboard can do it but the CLI cannot, the CLI silently rots.

## How to Apply

**For new features:**

1. Design the CLI command first (`zeno <noun> <verb>` shape, flags, output).
2. The dashboard may add a *view* for the new state but **must not** add a form, button, or HTTP POST/PUT/DELETE that mutates it.
3. If the operator needs to "do something" from the dashboard, the dashboard may surface the exact `zeno ...` command to copy-paste — never an inline action.
4. The API endpoint backing the new state is `GET`-only for the dashboard. If a write endpoint is needed, it is consumed by the CLI, not by the dashboard.

**For existing dashboard-write features (incremental migration):**

- Do not add new write paths in the dashboard while migration is in flight.
- When you touch an existing dashboard mutation for any reason, prefer migrating it to a `zeno` command rather than extending it.
- Migration of each surface (connectors, crons, skills, capabilities) is its own spec.

**OAuth callbacks are not mutations for this rule.** A callback handler that receives a third-party redirect (GitHub App install, Slack install, etc.) and persists the resulting credential is a system-driven write, not an operator-driven one. The operator initiated the flow from the CLI; the callback completes it.

## What this does not change

- The dashboard remains the place to **see** everything — sessions, logs, cron run history, connector invocation logs, skill execution traces, metrics. Visualization is its job.
- Read-only interactive controls (filter, sort, paginate, expand a log line) are fine — they don't mutate persisted state.
- The dashboard may still run *local-state* JS (collapsing a panel, switching tabs). It just doesn't POST.

## References

- Constitution §Architecture principles — "CLI is the only mutation surface".
- [[ui-in-paper]] — every rendered component still needs a Paper artboard, mutation rule does not exempt visualization-only UI from design discipline.
