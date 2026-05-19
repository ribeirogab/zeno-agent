---
tags:
  - learning
  - pnpm
  - react
  - monorepo
related:
  - "[[../specs/2026-04-16-ui-package/spec-ui-package]]"
created: 2026-04-17
---
# `@zeno/ui` must declare React as a peer, not a dep

When a workspace UI package bundles its own `react` dep, pnpm's strict hoisting can end up with two React instances in the dashboard — one from the app's `node_modules`, one from the package's. React hooks throw "invalid hook call" at runtime because the two copies don't share dispatcher state.

## Context

Spec 0016 created `packages/ui/` with shadcn primitives. Initial `package.json` listed `"react": "^19.2.0"` under `dependencies`. Dashboard booted but `useState` in a `Button` variant threw "invalid hook call". Confirmed by `pnpm why react` showing two resolved versions.

## How to Apply

For any workspace package that renders React:

```json
{
  "peerDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  }
}
```

`peerDependencies` tells pnpm "use the consumer's copy"; `devDependencies` gives the package's own test suite a copy to compile against. Do NOT put `react` in `dependencies` for any package that ships components.

Verify with `pnpm why react` in the app directory — should see one version, resolved from the workspace root.
