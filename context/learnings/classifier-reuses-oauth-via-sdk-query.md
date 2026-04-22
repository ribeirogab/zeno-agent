---
tags:
  - learning
  - "#concept"
related:
  - "[[claude-code-oauth-token]]"
  - "[[claude-agent-sdk-typescript]]"
created: 2026-04-22
---
# Classifier reuses OAuth via SDK query()

A "second LLM call" inside an agent doesn't require an Anthropic API key. The Claude Agent SDK's `query()` accepts a `model` option and, when called with `allowedTools: []` and `permissionMode: 'bypassPermissions'`, behaves as a one-shot classifier reusing the same `CLAUDE_CODE_OAUTH_TOKEN` the main agent uses. No extra dep, no API billing, no new auth path.

## Context

Built during spec 0023 (guardrails + approval flow). The pre-flight classifier (Haiku) had to inspect tool calls and decide if they need owner approval. First instinct was to add `@anthropic-ai/sdk` and a separate `ANTHROPIC_API_KEY`, but that violated the constitution ("OAuth, not API key") and added a second cost model. Using `query({ model: 'claude-haiku-4-5', allowedTools: [], systemPrompt: ..., prompt: ... })` and reading the single `result` message off the iterator works as a classification API — ~300-800ms per call, billed against the Claude subscription.

## How to Apply

When you need a small auxiliary LLM call inside Zeno (classifier, summarizer, router), reach for `query()` from `@anthropic-ai/claude-agent-sdk`, not the bare `@anthropic-ai/sdk`. Strip the call to the minimum: `allowedTools: []`, `persistSession: false`, `settingSources: ['user']`, dedicated `systemPrompt`, no MCP servers, short `abortController` timeout. Reference implementation: `apps/worker/src/guardrails/classifier/haiku.ts`.
