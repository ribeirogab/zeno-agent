---
tags:
  - learning
  - gotcha
created: 2026-05-21
---
# `gh pr merge --squash --delete-branch` fails with `invalid character 'd' after object key` on gh 2.83

The `gh` CLI v2.83 (released 2025-11-04) returns a cryptic `invalid character 'd' after object key` when invoking `gh pr merge <N> --squash --delete-branch`, even with `--admin`, even with explicit `--subject` and `--body`. The error originates inside gh's JSON request serialization; the merge is never attempted. Workaround: hit the GitHub REST API directly via `gh api`.

## Context

Hit while merging PR #94 (per-profile knowledge folder, spec [[../specs/2026-05-20-knowledge-folder-per-profile/spec-knowledge-folder-per-profile]]). Reproducible across multiple flag combinations:

```bash
gh pr merge 94 --squash --delete-branch
gh pr merge 94 --squash --delete-branch --admin
gh pr merge 94 --squash --subject "..." --body "..." --delete-branch
# all → invalid character 'd' after object key
```

The REST endpoint works:

```bash
gh api repos/<owner>/<repo>/pulls/<N>/merge -X PUT \
  -f merge_method=squash \
  -f commit_title="<subject>" \
  -f commit_message="<body>"
# → {"sha":"...","merged":true,"message":"Pull Request successfully merged"}
```

Branch deletion is then a follow-up `git push origin --delete <branch>` (the REST merge does not auto-delete).

Likely a regression in gh's flag-encoding for the merge command; not investigated upstream because the API workaround is one line.

## How to Apply

When `gh pr merge` returns `invalid character 'd' after object key` on gh ≥ 2.83, use:

```bash
gh api repos/<owner>/<repo>/pulls/<N>/merge -X PUT \
  -f merge_method=squash \
  -f commit_title="feat(scope): description (#<N>)" \
  -f commit_message="Closes #<issue>"
git push origin --delete <branch>
```

When gh ships a fix (likely > 2.83), revert to `gh pr merge --squash --delete-branch`. Re-test on first merge with each new gh version.
