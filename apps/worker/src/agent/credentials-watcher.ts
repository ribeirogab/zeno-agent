import type { BackendCredentialsRepo } from '@zeno/storage';
import { materializeClaudeCredentials } from './credentials-materializer.js';

/**
 * Spec 0071 — polls `backend_credentials.updated_at` and re-materializes the
 * SDK credentials file (`~/.claude/.credentials.json`) whenever the value
 * advances. Polling avoids needing SQLite row-change notifications, which
 * better-sqlite3 doesn't expose.
 *
 * Default poll interval: 5 seconds. Boot calls `start()` after the first
 * materialization (which the boot sequence does explicitly so the SDK has a
 * fresh file ready before the first agent turn).
 */
export interface CredentialsWatcherDeps {
  repo: BackendCredentialsRepo;
  claudeHome: string;
  /** id from `backends-catalog.json` — typically `claude-code`. */
  backendId: string;
  intervalMs?: number;
  logger?: {
    info: (obj: object, msg: string) => void;
    warn: (obj: object, msg: string) => void;
  };
}

export class CredentialsWatcher {
  private last: number | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: CredentialsWatcherDeps) {
    // Seed the watermark with the current value so `start()` doesn't fire an
    // immediate spurious materialize for an unchanged DB.
    this.last = deps.repo.latestUpdatedAt();
  }

  start(): void {
    if (this.timer) return;
    const interval = this.deps.intervalMs ?? 5000;
    const tick = async () => {
      try {
        const ts = this.deps.repo.latestUpdatedAt();
        if (ts === this.last) return;
        this.last = ts;
        const token = this.deps.repo.getValue(this.deps.backendId, 'oauth_token');
        if (!token) {
          // The credential was deleted (e.g. operator disabled the backend).
          // Leaving the credentials file in place is fine — the SDK will get
          // a fresh 401 on next call which is classified as auth_expired and
          // the channel responds gracefully. We don't unlink the file because
          // a transient empty state could race against a re-add.
          return;
        }
        await materializeClaudeCredentials({ claudeHome: this.deps.claudeHome, oauthToken: token });
        this.deps.logger?.info(
          { event: 'claude_credentials_materialized' },
          'wrote ~/.claude/.credentials.json from DB',
        );
      } catch (err) {
        this.deps.logger?.warn(
          { event: 'claude_credentials_materialize_failed', err: String(err) },
          'credentials watcher tick failed',
        );
      }
    };
    this.timer = setInterval(() => void tick(), interval);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
