---
tags:
  - learning
  - reference
related:
  - "[[../specs/0001-slack-zeno-mvp/spec|Zeno MVP spec]]"
created: 2026-04-15
---
# `gh repo list` with `--json` — fields and usage

Listing repos via the GitHub CLI with structured output, as used by Zeno's Claude to answer "which repos are in org X?" without any custom code.

## Context

Source: [gh cli manual — `gh repo list`](https://cli.github.com/manual/gh_repo_list). Authenticated inside Zeno's container via `GH_TOKEN` env var (PAT with `repo` + `read:org`).

## How to Apply

**Canonical call for Zeno:**

```bash
gh repo list octocat --json name,description,url,isPrivate,updatedAt --limit 100
```

Output is a JSON array, one object per repo.

**Key flags:**

| Flag | Purpose |
|---|---|
| `--json <fields>` | Emit JSON with the specified fields |
| `--jq <expression>` | Filter with `jq` inline |
| `-L, --limit <int>` | Max repos (default 30; raise for large orgs) |
| `--visibility public\|private\|internal` | Filter by visibility |
| `--topic <name>` | Filter by topic |
| `--fork` / `--source` | Only forks / only non-forks |
| `-l, --language <name>` | Filter by primary language |
| `--archived` / `--no-archived` | Include only / exclude archived |
| `-t, --template '<go-template>'` | Format as Go template |

**Useful JSON fields** (subset of ~60 available):
`name`, `description`, `url`, `isPrivate`, `updatedAt`, `createdAt`, `owner`, `isFork`, `isArchived`, `stargazerCount`, `primaryLanguage`, `visibility`, `pushedAt`, `diskUsage`.

**Auth via env var:** setting `GH_TOKEN=<pat>` is equivalent to `gh auth login`. For orgs with SAML SSO, the PAT must be authorized for that org in GitHub settings — otherwise `gh repo list <org>` returns an empty list or a 403 without a clear error. Document this in the Zeno troubleshooting section.

**Tip for LLM prompting:** add a hint in the system prompt that `gh` supports `--json` and prefer it over plain text — otherwise Claude may parse human-formatted output which is brittle.
