---
tags:
  - learning
  - "#pattern"
related:
  - "[[claude-agent-sdk-typescript]]"
created: 2026-04-22
---
# AsyncLocalStorage for per-call state in constructor-level SDK hooks

The Claude Agent SDK's `canUseTool` is a constructor option on the `query()` call, not a per-tool-call argument. That makes it awkward to give the hook per-call state (correlation id, requester id, conversation id) when the same backend instance handles many turns. `AsyncLocalStorage` from `node:async_hooks` solves this: build the hook once with a closure over `callStorage.getStore()`, populate the storage in the wrapper's `query()` method via `callStorage.run(callCtx, () => inner.query(input))`, and the hook reads the right context for each in-flight call without mutable instance state.

## Context

Built during spec 0023 wiring `GuardedBackend` around `ClaudeCodeBackend`. The `canUseTool` callback needs to know who is talking to the agent (owner vs other), the correlation id, the thread id — none of which are passed to the hook by the SDK. Storing them on `this` would race across concurrent calls (a single backend instance serves multiple Slack threads simultaneously). Mutating `AgentInput` would have leaked guardrail concerns into the backend interface. AsyncLocalStorage gives per-call isolation with zero changes to the SDK contract or to `AgentBackend`.

## How to Apply

Whenever a third-party API hands you a hook at construction time but the hook needs per-call data, define an `AsyncLocalStorage<CallContext>`, populate it inside the public method that triggers the API, and have the hook read from `storage.getStore()`. Always handle the missing-store case (`getStore()` returns `undefined`) — fail-safe. Reference: `apps/worker/src/guardrails/{async-context.ts,guarded-backend.ts}`.
