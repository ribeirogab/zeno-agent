---
tags:
  - learning
  - concept
related:
  - "[[../specs/2026-04-15-slack-zeno-mvp/spec|Zeno MVP spec]]"
  - "[[gh-repo-list-json]]"
  - "[[slack-mcp-vs-bolt]]"
created: 2026-04-15
---
# GitHub MCP server — status and fit for Zeno

The MCP GitHub server originally lived at `@modelcontextprotocol/server-github` (npm) but **development moved to [github/github-mcp-server](https://github.com/github/github-mcp-server)** — the official one is now maintained by GitHub itself. It exposes GitHub API operations (file read/write, repo management, search, issues, PRs) as MCP tools for LLM agents.

## Context

During Zeno discovery we checked whether an MCP GitHub server would simplify listing repos vs Claude calling `gh` through Bash. For the MVP scenario ("which repos exist in org X?"), the answer is **no — stay with `gh` CLI via Bash**.

Source: [npm @modelcontextprotocol/server-github](https://www.npmjs.com/package/@modelcontextprotocol/server-github) (points to new repo).

## How to Apply

**For MVP ("list repos in org"):** `gh repo list octocat --json name,description,url --limit 100` is:
- One Bash call, no additional MCP server to configure.
- Already authenticated via `GH_TOKEN` env var (see [[gh-repo-list-json]]).
- Output is already structured JSON (via `--json`).
- Zero additional dependency surface.

MCP server would add: a separate process, auth configuration, tool registration in SDK options, and — worst — Claude would have less predictable behavior choosing between multiple similar tools (`mcp__github__list_repos` vs `Bash` with `gh`).

**When to reconsider adopting the GitHub MCP server:**
- Workflows that need many related GitHub ops in one turn (diff a PR, read comments, add review) — MCP server batches these naturally.
- Scenarios where the LLM should NOT have general shell access but still needs GitHub (rare for Zeno; shell is fine).
- If the MCP server exposes capabilities not easily scriptable through `gh` (e.g., GraphQL with typed results).

**Recommendation for Zeno:**
- MVP: no MCP GitHub server.
- GitHub App iteration (spec's next step): re-evaluate. GitHub App auth might pair more naturally with MCP server (which handles installation tokens), making it preferable over maintaining raw `gh` calls with the App.
