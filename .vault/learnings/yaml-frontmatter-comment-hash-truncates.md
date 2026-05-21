---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-20-knowledge-folder-per-profile/spec-knowledge-folder-per-profile]]"
created: 2026-05-21
---
# YAML frontmatter values with `#` get silently truncated as comments

A frontmatter line like `description: A canary note seeded as part of issue #90 e2e verification` is parsed by `yaml.parse()` as `description: "A canary note seeded as part of issue"` — everything from the `#` onwards is interpreted as a YAML comment and discarded silently. The same happens for any unquoted scalar containing `#`, `:`, or other YAML control characters. The bug surfaces in the rendered `_index.md` as a truncated description with no warning.

## Context

Hit while seeding the e2e canary file for spec [[../specs/2026-05-20-knowledge-folder-per-profile/spec-knowledge-folder-per-profile|2026-05-20-knowledge-folder-per-profile]]. The file's frontmatter contained `description: A canary note seeded as part of issue #90 e2e verification — used to confirm the agent reads files from /app/knowledge/`. The generated `_index.md` listing showed:

```
- [zeno-knowledge-test.md](zeno-knowledge-test.md) — A canary note seeded as part of issue
```

The `#90 e2e verification...` tail was eaten by YAML's comment rule. No warning, no error — just a quietly shorter description. The feature still worked end-to-end; only the listing's description looked incomplete.

## How to Apply

When authoring knowledge frontmatter (or any YAML frontmatter consumed by `@zeno/knowledge`):

1. **Quote** any string value that contains `#`, `:`, or starts with `!`, `&`, `*`, `?`, `|`, `>`, `<`, `%`, `@`, `\`` — use single or double quotes:
   ```yaml
   description: "A canary note seeded as part of issue #90 e2e verification"
   ```
2. When in doubt, quote — the cost is one character per side; the win is no silent truncation.
3. The CLI command `zeno knowledge index <profile>` does NOT warn about truncation — it cannot, because by the time YAML is parsed the original `#` context is gone. Operator-side discipline only.

Documenting this in `apps/docs/content/docs/knowledge.mdx` as a callout could prevent future operators from hitting it.
