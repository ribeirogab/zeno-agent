import type { BackendCredentialsRepo } from '@zeno/db/runtime';

/**
 * Spec 0071 — credentials accessor for the worker.
 *
 * The worker MUST NOT set `process.env.CLAUDE_CODE_OAUTH_TOKEN` (per
 * `.vault/rules/integration-tokens-in-db-only.md`): anything in process.env is
 * `env | grep`-readable by the agent's Bash, defeating the dashboard's
 * disable toggle. Instead, this service reads the encrypted token from DB on
 * demand and the caller decides between (a) passing it to the SDK via the
 * per-call `env` opt or (b) handing it to the materializer to write to
 * `~/.claude/.credentials.json` for the SDK file-cache path.
 *
 * The returned plaintext lives only in the calling closure — never logged,
 * never persisted, never set on `process.env`.
 */
export class NoBackendConfiguredError extends Error {
  constructor(public readonly backendId: string) {
    super(`backend ${backendId} is not configured`);
    this.name = 'NoBackendConfiguredError';
  }
}

export class CredentialsService {
  constructor(private readonly deps: { repo: BackendCredentialsRepo }) {}

  /**
   * Returns the decrypted token for a backend's primary auth field
   * (`oauth_token` for claude-code today). Returns `null` if no row exists.
   */
  getActiveBackendToken({ backendId }: { backendId: string }): string | null {
    return this.deps.repo.getValue(backendId, 'oauth_token');
  }

  /** Like `getActiveBackendToken` but throws when missing — for code paths
   *  that already established a backend should be configured. */
  requireActiveBackendToken({ backendId }: { backendId: string }): string {
    const token = this.getActiveBackendToken({ backendId });
    if (!token) throw new NoBackendConfiguredError(backendId);
    return token;
  }
}
