---
# Display name for this note. Optional. When absent the worker uses the
# first `# Heading` in the body, or the filename if there is no heading.
title: Release flow

# One-line summary shown next to the file path in _index.md and surfaced
# in the system prompt. Optional. When absent the worker uses the first
# paragraph of the body (truncated to 120 chars).
description: How code goes from main to production

# Tags for grouping this note across folder boundaries. Optional.
# No nested/hierarchical syntax — flat list of strings.
tags: [process, deploy]

# Other knowledge notes this one references. Each item is the .md slug
# without extension (wikilink style). Worker resolves `stack` → `stack.md`
# anywhere in `knowledge/`. Use a path prefix when ambiguous
# (e.g. `engineering/stack` if multiple `stack.md` exist in different folders).
related: [stack, ci-cd, on-call]
---
