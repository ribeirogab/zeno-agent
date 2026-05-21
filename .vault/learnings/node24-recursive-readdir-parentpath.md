---
tags:
  - learning
  - reference
related:
  - "[[node-lts-current]]"
  - "[[../specs/2026-05-20-knowledge-folder-per-profile/spec-knowledge-folder-per-profile]]"
created: 2026-05-21
---
# Node 24 `readdirSync({ recursive, withFileTypes })` exposes `parentPath` — skip manual recursion

Node 24's `readdirSync(root, { recursive: true, withFileTypes: true })` returns `Dirent` entries whose `parentPath` field is populated with the absolute directory containing each entry. Combined with `relative(root, entry.parentPath)` you get a depth-agnostic walk in five lines, no manual recursion, no third-party `globby` / `fast-glob` dep.

## Context

Used in `packages/knowledge/src/scan.ts` and `apps/worker/src/knowledge/loader.ts` to walk the knowledge folder for spec [[../specs/2026-05-20-knowledge-folder-per-profile/spec-knowledge-folder-per-profile|2026-05-20-knowledge-folder-per-profile]]. Earlier Zeno code rolls its own recursion or imports `node:fs/promises.readdir({ recursive: true })` returning bare strings, which loses parent context and requires a second `stat()` per file. The synchronous + withFileTypes + recursive combination came together in Node 20.10 and is reliable across the Node 22/24 pair Zeno supports.

## How to Apply

For any FS walk that needs file metadata + depth-agnostic traversal:

```ts
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const absPath = join(entry.parentPath, entry.name);
  const relPath = relative(root, absPath).split(sep).join('/');
  const stat = statSync(absPath);
  // ... handle file
}
```

Do not reach for `globby` or `fast-glob` for repo-internal walks — the Node primitive covers the use case and avoids the dep. Project pins Node 24 (see [[node-lts-current]]); the API is stable.
