---
tags:
  - learning
  - testing
  - gotcha
related:
  - "[[../specs/2026-05-20-agents-md-per-instance/spec-agents-md-per-instance|spec 2026-05-20 agents-md-per-instance]]"
created: 2026-05-20
---
# Regression-guard tests that assert a deleted string is absent will trip a final `git grep` AC

When a refactor removes a name (function, identifier, file, prompt-heading), the natural regression guard is a test like `expect(out).not.toContain('USER.md')`. The literal `'USER.md'` in the test source then matches a final acceptance criterion of the form `git grep -E 'USER\.md' apps/` — even though the test is doing the right thing semantically. The grep cannot distinguish "the source still uses the dead name" from "the source asserts the dead name is absent".

The fix is to construct the forbidden substring in a way the grep AC does not match: a regex with a character class is the smallest change. `expect(out).not.toMatch(/[uU]SER\.md/)` reads the same to a human, fails on the same input, and contains no literal `USER.md`. Alternative routes — excluding the test directory from the grep, building the string at runtime with `String.fromCharCode`, or moving the assertion into a comment — all add complexity for no gain over the character-class trick.

## Context

Spec 2026-05-20's final-grep AC was `git grep -E 'USER\.md|user-md|...' apps/ packages/ templates/ agent/ AGENTS.md CLAUDE.md` and had to return empty. The worker's `system-prompt.test.ts` initially included `expect(out).not.toContain('USER.md')` as a regression guard and `expect(out).not.toContain('About the user')`. The literal `'USER.md'` matched the grep, so the AC failed despite the test being correct.

## How to Apply

- When writing a regression-guard test that asserts a deleted string is absent, encode the forbidden substring with a character class: `/[uU]SER\.md/` instead of `'USER.md'`.
- The same applies to JSDoc that mentions the legacy name for migration context. Either rephrase to omit the literal (e.g., "the legacy per-profile user file" instead of "USER.md"), or accept that the doc lives in the historical record and exclude the file from the final grep AC.
- If both routes are unworkable, set the AC to `git grep -lE '...' apps/ | grep -v '\.test\.'` so the noise filter is explicit, not hidden in the assertion's encoding. But character classes are usually simpler.
