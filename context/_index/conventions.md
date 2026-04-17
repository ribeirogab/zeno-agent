---
tags:
  - moc
---
# Conventions — Map of Content

Deliberate code style choices that all code in Zeno must follow. These are not safety rules (those live in the constitution) and not things learned from incidents (those live in learnings). These are team decisions about how code should look and be structured.

## Code style

- [[../conventions/code-style|TypeScript code style]] — single quotes, semicolons, trailing commas, no one-letter vars, organized imports. Enforced by Biome (`biome.json`).
- [[../conventions/code-style#File naming|File naming]] — kebab-case for source, test, and route files. PascalCase only for React components exported from them.
- [[../conventions/code-style#Dashboard mutations|Dashboard mutations]] — every mutation with a cache effect uses `useOptimisticMutation` + `cacheChange<T>()`.
