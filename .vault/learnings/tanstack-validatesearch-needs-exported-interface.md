---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-20-knowledge-browser-page/spec-knowledge-browser-page]]"
  - "[[tanstack-router-pretypecheck-regen]]"
created: 2026-05-21
---
# TanStack Router `validateSearch` interface must be exported and `exactOptional` aware

When a TanStack file route uses `validateSearch: (search) => MyShape`, the generated `route-tree.gen.ts` references `MyShape` in the route's exported type. If `MyShape` is declared as a non-exported `interface` (or `type`), `tsc` fails with `TS4023: Exported variable ... has or is using name 'MyShape' from external module ... but cannot be named`. Separately, under `exactOptionalPropertyTypes: true` (the default in this repo's TS config), a search param declared as `file?: string` is NOT assignable from `{ file: string | undefined }` returned by `validateSearch` — the property must be explicitly typed `file?: string | undefined`.

## Context

Hit while wiring `/knowledge?file=…` deep-link for spec [[../specs/2026-05-20-knowledge-browser-page/spec-knowledge-browser-page|2026-05-20-knowledge-browser-page]]. Initial code:

```ts
interface KnowledgeSearch {
  file?: string;
}
export const Route = createFileRoute('/_authed/knowledge')({
  validateSearch: (s): KnowledgeSearch => ({
    file: typeof s.file === 'string' ? s.file : undefined,
  }),
  component: KnowledgeScreen,
});
```

Two `tsc` errors:

```
src/routes/_authed/knowledge.tsx:15:74 - error TS2375: Type '{ file: string | undefined; }'
  is not assignable to type 'KnowledgeSearch' with 'exactOptionalPropertyTypes: true'.
src/route-tree.gen.ts:63:7 - error TS4023: Exported variable 'AuthedKnowledgeRoute'
  has or is using name 'KnowledgeSearch' from external module
  ".../routes/_authed/knowledge" but cannot be named.
```

Two fixes (must apply both):

```ts
export interface KnowledgeSearch {
  file?: string | undefined;
}
```

After `tsr generate` regenerates the route tree, `tsc` is clean. Without `export`, the generated file imports `KnowledgeSearch` and TS refuses to widen the inferred export. Without `| undefined`, exact-optional collides with the explicit `undefined` value returned by `validateSearch`.

## How to Apply

For any new TanStack file route with `validateSearch`:

1. **`export` the search interface.** It will be imported by the generated route tree even if your own component never imports it externally.
2. **Type optional search params as `key?: type | undefined`**, not `key?: type`. The discriminating factor is whether the validator ever returns `{ key: undefined }` — TanStack's convention does (it lets `useSearch` discriminate "absent" from "present-as-undefined"), and under `exactOptionalPropertyTypes` the two forms diverge.
3. After adding the route file, run `pnpm --filter @zeno/dashboard exec tsr generate` before typecheck — see [[tanstack-router-pretypecheck-regen]] for the broader gate.
