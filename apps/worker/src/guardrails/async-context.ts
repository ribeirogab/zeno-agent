import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-call state needed by the `canUseTool` hook. The hook is bound once at
 * `ClaudeCodeBackend` construction time, but every concrete tool-call needs to
 * see the requester/correlation/thread that triggered the current `query()`.
 * `GuardedBackend.query` opens an `AsyncLocalStorage` scope before delegating
 * to the inner backend so the closure can read the current call's context.
 */
export interface CallContext {
  requesterUserId: string;
  isOwner: boolean;
  threadId: string | null;
  conversationId: string;
  correlationId: string;
}

export const callStorage = new AsyncLocalStorage<CallContext>();
