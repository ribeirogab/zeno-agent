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
- **Imports auto-organized** by Biome on `npm run check`. Order: external packages first, then internal (alphabetical within group). Don't manually reorder.

**Commands:**
- `npm run format` — apply formatter (write changes).
- `npm run lint` — lint only, no writes.
- `npm run check` — combined: format + lint + organize imports + auto-fix where safe.

**Pre-commit:** run `npm run check` before staging code.

**Examples:**

```ts
// good
import { z } from 'zod';

const env = parsed.data;
const issues = parsed.error.issues.map((issue) => issue.message).join('; ');

// bad — double quotes, missing semicolon, one-letter var
import { z } from "zod"
const e = parsed.data
const m = parsed.error.issues.map(i => i.message).join("; ")
```
