---
tags:
  - learning
  - concept
related:
  - "[[../specs/2026-04-21-multi-profile-isolation/spec|spec 0022]]"
created: 2026-04-21
---
# GitHub App authentication: JWT → installation token rotation

GitHub Apps authenticate via a two-step token exchange that must be refreshed every ~55 minutes. No external libraries are needed — Node's `crypto` module handles the JWT.

## Context

Implemented to make Zeno's GitHub operations appear as `acme-bot[bot]` instead of the owner's personal account. Supports multiple orgs (AcmeBooks, AcmeShop, etc.), each with its own installation.

## How It Works

1. **JWT creation** (RS256): sign `{ iat: now-60, exp: now+600, iss: appId }` with the app's private key (`.pem`). Valid 10 minutes.
2. **Token exchange**: `POST https://api.github.com/app/installations/{id}/access_tokens` with the JWT as Bearer token. Returns an installation token valid for 1 hour.
3. **Cache + rotate**: cache each installation's token; refresh all every 55 minutes via `setInterval`.
4. **Env propagation**: set `process.env[envVar] = token` for each installation (e.g., `ACME_GH_TOKEN`). Set `process.env.GH_TOKEN` to the primary installation's token so it's the default for all `gh`/`git` commands. Save the original PAT as `GH_TOKEN_PERSONAL`.

API version header must be `2022-11-28` (stable), not the bleeding-edge version.

## How to Apply

Config lives in `profiles/<name>/config.yaml` under a `github_app:` section. The `GitHubAppAuth` class in `apps/worker/src/github/app-auth.ts` handles the full lifecycle. Private key lives in the profile directory (gitignored).

For git commits to appear as the bot, set `user.name` and `user.email` in the container's global gitconfig (done via entrypoint). Email format: `<app_id>+<app_name>[bot]@users.noreply.github.com`.

For clone URLs: never embed tokens in the remote URL (`x-access-token:TOKEN@github.com/...`). Use a credential helper that reads `GH_TOKEN` from env at runtime — survives token rotation without recloning.
