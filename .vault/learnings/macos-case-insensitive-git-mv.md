---
tags:
  - learning
  - git
  - macos
related:
  - "[[../specs/2026-04-16-dashboard-kebab-case/spec-dashboard-kebab-case]]"
created: 2026-04-17
---
# macOS case-insensitive FS needs two-step `git mv` for case-only renames

On macOS (APFS default), `git mv Sidebar.tsx sidebar.tsx` is a no-op because the FS treats them as the same path. Git silently succeeds but the case doesn't change. The fix is a two-step rename through an intermediate name.

## Context

Spec 0015 renamed 22 PascalCase component files to kebab-case. First attempt with `git mv Sidebar.tsx sidebar.tsx` appeared to work but `git status` showed nothing. The commit would have been empty.

## How to Apply

For case-only renames on macOS:

```bash
git mv Sidebar.tsx _sidebar.tsx
git mv _sidebar.tsx sidebar.tsx
```

Or script the entire batch with a loop — the two `mv`s per file must both be committed (or staged together) so Git registers the rename. Don't add `core.ignorecase=false` to `.gitconfig`: it breaks other tooling and the case-sensitive check works per-repo too. The two-step is the cheapest fix.

CI (Linux) doesn't have this problem, but everyone on macOS needs the workaround.
