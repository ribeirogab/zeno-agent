---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-19-connector-postgres/spec-connector-postgres]]"
  - "[[connectors-validation-findings]]"
created: 2026-05-19
---
# `zeno connector install --verify` silently skips on multi-instance catalogs

The CLI's post-install verification path (`runConnectorInstall` in `apps/cli/src/commands/connector-install.ts`) identifies the freshly created row by diffing the `/api/connectors` listing before and after the install:

```ts
const after = await client.get<InstalledConnector[]>('/api/connectors');
const fresh = after.find((c2) => !preInstallSlugs?.has(c2.slug));
if (!fresh) return; // silently skip verify
```

This `find` walks the TOP-LEVEL items only. When the installed catalog already has another instance (so `connectors_listing.ts` returns a `connector_group` item with the new + old installs nested under `installations[]`), the top-level items are `{kind: 'connector_group', installations: [...]}` with **no `slug` field**. `fresh` is `undefined`, the function returns at "installed", and the operator never sees the verify run — bad URLs land as "installed" without auto-rollback.

## Context

Discovered during the connector-postgres spec's Task 7 (P1.2 / P1.5). First install of a new catalog → standalone row → verify runs. Second install of the same catalog → grouped → verify silently skipped. Reproducible against every multi-instance catalog (Linear, GitHub Personal, Klaviyo, …), not just postgres.

## How to Apply

When fixing: flatten the grouped listing in `runConnectorInstall`'s post-install lookup. Each `connector_group` item exposes `installations[]` with `slug` per row; walk those alongside the top-level standalone connectors. Pseudocode:

```ts
const allSlugs = after.flatMap((item) =>
  item.kind === 'connector_group'
    ? item.installations.map((i) => ({ id: i.connectorId, slug: i.slug }))
    : [{ id: item.id, slug: item.slug }],
);
const fresh = allSlugs.find((s) => !preInstallSlugs?.has(s.slug));
```

Workaround until fixed: install the second instance with `--no-verify` and run `zeno connector test <slug>` manually.

## See also

- `apps/cli/src/commands/connector-install.ts:120-128` (the silent-skip path).
- `apps/api/src/routes/connectors.ts:830-883` (where the listing collapses 2+ same-catalog rows into `connector_group`).
