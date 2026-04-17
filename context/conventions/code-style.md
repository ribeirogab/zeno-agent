---
tags:
  - convention
  - code-style
applies-to:
  - src/**/*.ts
  - tests/**/*.ts
created: 2026-04-15
---
# Code style — TypeScript

Code style for TypeScript files in Zeno. Enforced by Biome (`biome.json`); CI/pre-commit will run `npm run check` to fix and verify.

## Why

Consistency with no human cycles spent on formatting. One tool (Biome) replaces ESLint + Prettier — fewer config files, faster runs, single source of truth. The specific choices below reflect explicit user preferences captured at project init.

## How to Apply

**Mandatory rules (formatter):**
- **Single quotes** for strings (`'foo'`, not `"foo"`).
- **Always semicolons** at end of statements.
- **Trailing commas everywhere** (`'all'` — params, arrays, objects, etc.).
- **2-space indent**, LF line endings, 100-char line width.
- **Arrow parentheses always**: `(x) => x`, never `x => x`.

**Mandatory rules (linter / hygiene):**
- **No one-letter variable names.** Trade `e` → `error`/`env`, `i` → `index`/`issue`, `r` → `result`, `m` → `message`. Loop counters and lambda parameters included. Biome's `useNamingConvention` rule is off (it didn't fit our env-var pattern); enforcement is by review and convention.
- **Path aliases for cross-package imports.** Use `@/...` for `src/...` and `@tests/...` for `tests/...`. Never use deep relative paths (`../../../foo`). Configured in `tsconfig.json` (`paths`), `vitest.config.ts` (`resolve.alias`), and rewritten at build time by `tsc-alias --resolve-full-paths` (adds `.js` for ESM).
- **Imports auto-organized** by Biome on `npm run check`. Order: Node built-ins → external packages → aliased imports (`@/`) → relative (`./`, `../`). Don't manually reorder.

**Commands:**
- `npm run format` — apply formatter (write changes).
- `npm run lint` — lint only, no writes.
- `npm run check` — combined: format + lint + organize imports + auto-fix where safe.

**Pre-commit:** run `npm run check` before staging code.

**Examples:**

```ts
// good
import { z } from 'zod';
import { logger } from '@/logger';
import type { Channel } from '@/channels/types';

const env = parsed.data;
const issues = parsed.error.issues.map((issue) => issue.message).join('; ');

// bad — double quotes, missing semicolon, one-letter var, deep relative import
import { z } from "zod"
import { logger } from "../../logger.js"
const e = parsed.data
const m = parsed.error.issues.map(i => i.message).join("; ")
```

## File naming

All source files use **kebab-case** basenames with the standard extension.

| Kind | Filename example | Exported name |
|---|---|---|
| React component | `message-block.tsx` | `MessageBlock` |
| React hook | `use-logs.ts` | `useLogs` |
| Utility / module | `api-client.ts`, `log-filters.ts` | `apiFetch`, `LogFilters` |
| Route (TanStack Router) | `crons.$id.tsx`, `sessions.index.tsx` | `Route` |
| Test | `sidebar.test.tsx`, `logs.test.ts` | n/a |

**Exceptions — do not rename:**

- TanStack Router conventions: `__root.tsx`, `_authed.tsx`, and the generated `route-tree.gen.ts`.
- Config files owned by tooling: `vite.config.ts`, `tailwind.config.ts`, `biome.json`, `postcss.config.js`, etc.

**macOS gotcha.** The default macOS filesystem is case-insensitive. A direct
`git mv Foo.tsx foo.tsx` is a silent no-op — git does not register the rename
and the file system holds both names ambiguously. Always use an intermediate
name when changing case:

```bash
git mv Foo.tsx _foo.tsx
git mv _foo.tsx foo.tsx
```

This rule is not enforced by Biome today (`useFilenamingConvention` is off to
accommodate env-var patterns elsewhere). Review catches violations. If drift
becomes a problem, re-evaluate enabling the rule with exceptions.
