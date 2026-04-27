/**
 * GitHubAppAuth — stateful wrapper around `@zeno/github-app` primitives.
 * Spec 0042 (creation) → spec 0044 (refactor + surgical mutations) →
 * spec 0051 (envVar drop).
 *
 * The class holds:
 *   - one App credential set (`appId`, `pem`)
 *   - N installations (`{name, id}`) — the operator-picked envVar field was
 *     removed in spec 0051 (the github-mcp-server subprocess authenticates
 *     via `GITHUB_PERSONAL_ACCESS_TOKEN`, set by `mcp-build.ts` directly
 *     from the cached installation token; nothing reads `process.env[envVar]`).
 *   - a per-installation token cache + auto-refresh interval
 *
 * Surgical mutations let the dashboard mutate state without restarting the
 * worker:
 *   - addInstallation     → bootstrap a token for one new installation
 *   - removeInstallation  → drop cache + remove installation entry
 *   - renameInstallation  → rename only (no env-var rewiring; spec 0051)
 *   - appUninstall        → tear-down (cache, refresh interval)
 *
 * Spec 0051: `rotatePem` removed. PEM rotation is handled via uninstall +
 * reinstall (rare event).
 *
 * Loaded from DB on worker boot via `loadGitHubAppFromDb(repos, logger)`. The
 * yaml fallback was removed per spec 0044.
 */

import {
  computePemSha256,
  fetchAppMetadata,
  GitHubAppError,
  mintInstallationToken,
  signAppJwt,
} from '@zeno/github-app';
import { createLogger } from '@zeno/logger';
import type { ConnectorAppRepo, ConnectorRepo } from '@zeno/storage';

const logger = createLogger({ service: 'worker' });

const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
const REFRESH_INTERVAL_MS = 55 * 60_000;
// Spec 0048 Q3: per-installation exponential backoff for failed refresh.
const RETRY_BACKOFF_MS = [30_000, 60_000, 120_000, 240_000, 480_000];

// Reserved secret keys for github-app-* connectors.
// Spec 0042 had 5; spec 0044 dropped APP_ID + PEM (moved to connector_apps);
// spec 0051 dropped ENV_VAR.
export const GITHUB_APP_RESERVED_KEYS = {
  INSTALLATION_ID: '__GITHUB_INSTALLATION_ID__',
  INSTALLATION_NAME: '__GITHUB_INSTALLATION_NAME__',
} as const;

export interface Installation {
  name: string;
  id: string;
}

interface CachedToken {
  token: string;
  expiresAt: Date;
}

export interface GitHubAppAuthOptions {
  appId: string;
  privateKey: string;
  installations: Installation[];
  /** Optional: when provided, used to skip the auto-refresh interval (tests). */
  disableAutoRefresh?: boolean;
  /**
   * Spec 0048 Q2: optional callback to record a refresh failure to
   * connector_apps.last_refresh_error_at. Called with `null` on success
   * (clears any previous error). Called with the error message on failure.
   */
  onRefreshResult?: (result: { success: boolean; errorMessage: string | null }) => void;
}

export class GitHubAppAuth {
  private appId: string;
  private privateKey: string;
  private readonly installations: Map<string, Installation> = new Map();
  private readonly cache: Map<string, CachedToken> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly disableAutoRefresh: boolean;
  private readonly onRefreshResult: GitHubAppAuthOptions['onRefreshResult'];
  // Spec 0048 Q4: track per-installation last-refresh state to suppress
  // routine-success log noise. Logs fire on init + on transition (failure or
  // recovery). 'unknown' = haven't refreshed yet (boot path).
  private readonly lastRefreshState = new Map<string, 'unknown' | 'success' | 'failed'>();
  // Spec 0048 Q3: per-installation retry backoff index. 0 = no backoff
  // active; 1+ = next retry at RETRY_BACKOFF_MS[i-1] from the last failure.
  // Cleared on success.
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();
  private readonly retryStep = new Map<string, number>();

  constructor(opts: GitHubAppAuthOptions) {
    this.appId = opts.appId;
    this.privateKey = opts.privateKey;
    for (const inst of opts.installations) {
      this.installations.set(inst.name, inst);
      this.lastRefreshState.set(inst.name, 'unknown');
    }
    this.disableAutoRefresh = opts.disableAutoRefresh ?? false;
    this.onRefreshResult = opts.onRefreshResult;
  }

  // ─── Read API ───────────────────────────────────────────────────────────

  /**
   * Sync read of a cached installation token. Returns null only when the
   * cache is empty OR the token has hard-expired. Spec 0048 Q3:
   * stale-but-valid tokens (within the 5min refresh margin) are STILL
   * returned during outages — better to use a soon-to-expire token than to
   * fail outright. The agent will retry on auth-error if the token expires
   * mid-call, and the next refresh tick reseeds the cache.
   */
  getCachedToken(installationName: string): string | null {
    const cached = this.cache.get(installationName);
    if (!cached) return null;
    if (cached.expiresAt.getTime() <= Date.now()) return null;
    return cached.token;
  }

  /** TOKEN_REFRESH_MARGIN_MS used by getToken's async path (mint when within margin). */
  private isWithinRefreshMargin(installationName: string): boolean {
    const cached = this.cache.get(installationName);
    if (!cached) return false;
    return cached.expiresAt.getTime() - Date.now() <= TOKEN_REFRESH_MARGIN_MS;
  }

  /** Spec 0044: invalidate one cached token (callable from outside). */
  invalidateCache(installationName: string): void {
    this.cache.delete(installationName);
  }

  /**
   * Async: cached token if valid + outside the refresh margin, else mint a
   * fresh one. Differs from getCachedToken in that it actively refreshes
   * within the margin.
   */
  async getToken(installationName: string): Promise<string | null> {
    if (!this.isWithinRefreshMargin(installationName)) {
      const cached = this.cache.get(installationName);
      if (cached && cached.expiresAt.getTime() > Date.now()) return cached.token;
    }
    const installation = this.installations.get(installationName);
    if (!installation) return null;
    return this.mintAndCache(installation);
  }

  /** List of installation NAMES currently held. */
  getInstallationNames(): string[] {
    return [...this.installations.keys()];
  }

  /** App ID currently held. */
  getAppId(): string {
    return this.appId;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Mint a token for every installation in parallel; start the auto-refresh
   * interval. Tolerates per-installation failures (logged warn, not fatal).
   */
  async bootstrap(): Promise<void> {
    await this.refreshAll();
    if (!this.disableAutoRefresh) {
      this.refreshTimer = setInterval(() => {
        this.refreshAll().catch((error) => {
          logger.error(
            { event: 'github_app_refresh_failed', err: String(error) },
            'failed to refresh GitHub App tokens',
          );
        });
      }, REFRESH_INTERVAL_MS);
    }
    logger.info(
      { event: 'github_app_auth_started', installations: this.getInstallationNames() },
      'GitHub App auth started',
    );
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    // Spec 0048 Q3: clear any pending retry timers on stop/uninstall.
    for (const t of this.retryTimers.values()) {
      clearTimeout(t);
    }
    this.retryTimers.clear();
    this.retryStep.clear();
  }

  /**
   * Spec 0048 Q3: schedule an exponential-backoff retry for a single
   * installation that just failed to refresh. Cancels any pending retry.
   */
  private scheduleRetry(installation: Installation): void {
    const existing = this.retryTimers.get(installation.name);
    if (existing) clearTimeout(existing);
    const step = this.retryStep.get(installation.name) ?? 0;
    const delay = RETRY_BACKOFF_MS[Math.min(step, RETRY_BACKOFF_MS.length - 1)] ?? 480_000;
    const timer = setTimeout(() => {
      this.retryTimers.delete(installation.name);
      // The mintAndCache call invokes onRefreshResult-equivalent logic via
      // the lastRefreshState transition path, so we don't fire the
      // aggregate cycle log here. Per-installation only.
      this.retryInstallation(installation).catch((err) => {
        logger.error(
          { event: 'github_app_retry_unhandled', name: installation.name, err: String(err) },
          'unhandled error in retry path',
        );
      });
    }, delay);
    this.retryTimers.set(installation.name, timer);
    this.retryStep.set(installation.name, step + 1);
    logger.info(
      {
        event: 'github_app_retry_scheduled',
        name: installation.name,
        delayMs: delay,
        step: step + 1,
      },
      'scheduled retry for failed installation refresh',
    );
  }

  /**
   * Spec 0048 Q3: single-installation retry. On success: cancels backoff,
   * logs recovery. On failure: schedules next backoff step.
   */
  private async retryInstallation(installation: Installation): Promise<void> {
    const previousState = this.lastRefreshState.get(installation.name) ?? 'failed';
    try {
      await this.mintAndCache(installation);
      this.lastRefreshState.set(installation.name, 'success');
      this.retryStep.delete(installation.name);
      if (previousState === 'failed') {
        logger.info(
          { event: 'github_app_token_refresh_recovered', installation: installation.name },
          'installation token recovered after backoff retry',
        );
      }
      // Update DB to clear the error timestamp on this single recovery.
      this.onRefreshResult?.({ success: true, errorMessage: null });
    } catch (err) {
      this.lastRefreshState.set(installation.name, 'failed');
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        {
          event: 'github_app_retry_failed',
          installation: installation.name,
          err: message,
        },
        'retry failed; scheduling next backoff step',
      );
      this.scheduleRetry(installation);
    }
  }

  // ─── Surgical mutations (spec 0044) ────────────────────────────────────

  /**
   * Add one new installation, mint its initial token asynchronously. Does NOT
   * affect existing cached tokens. Idempotent on duplicate names (logs a warn
   * and overwrites — the dashboard prevents this in practice).
   */
  async addInstallation(installation: Installation): Promise<void> {
    if (this.installations.has(installation.name)) {
      logger.warn(
        { event: 'github_app_add_installation_duplicate', name: installation.name },
        'addInstallation called with an existing name; overwriting',
      );
    }
    this.installations.set(installation.name, installation);
    try {
      await this.mintAndCache(installation);
    } catch (err) {
      // Don't blow up the caller — the install is still recorded; refresh
      // interval will retry. Surface the error to the operator via logs.
      logger.error(
        {
          event: 'github_app_add_installation_token_failed',
          name: installation.name,
          err: String(err),
        },
        'initial token mint failed for new installation; will retry on next refresh',
      );
    }
  }

  /**
   * Remove one installation: drop cache, drop in-memory entry. Spec 0051:
   * env var unset removed (operator-picked envVar dropped — nothing reads
   * `process.env[envVar]` anymore).
   */
  removeInstallation(name: string): void {
    if (!this.installations.has(name)) {
      logger.warn(
        { event: 'github_app_remove_installation_not_found', name },
        'removeInstallation called with an unknown name',
      );
      return;
    }
    this.cache.delete(name);
    this.installations.delete(name);
    // Spec 0048 Q3: cancel any pending retry for this installation.
    const pendingRetry = this.retryTimers.get(name);
    if (pendingRetry) {
      clearTimeout(pendingRetry);
      this.retryTimers.delete(name);
    }
    this.retryStep.delete(name);
    this.lastRefreshState.delete(name);
    logger.info({ event: 'github_app_installation_removed', name }, 'installation removed');
  }

  /**
   * Rename an installation. Preserves the cached token (the underlying
   * GitHub installation is the same — only the alias name changes).
   *
   * Spec 0051: env-var rewiring removed (operator-picked envVar dropped).
   */
  renameInstallation(args: { oldName: string; newName: string }): void {
    const inst = this.installations.get(args.oldName);
    if (!inst) {
      logger.warn(
        { event: 'github_app_rename_installation_not_found', name: args.oldName },
        'renameInstallation called with an unknown name',
      );
      return;
    }
    if (args.oldName !== args.newName) {
      const cached = this.cache.get(args.oldName);
      if (cached) {
        this.cache.set(args.newName, cached);
        this.cache.delete(args.oldName);
      }
      this.installations.delete(args.oldName);
    }
    const updated: Installation = { ...inst, name: args.newName };
    this.installations.set(args.newName, updated);
    logger.info(
      { event: 'github_app_installation_renamed', oldName: args.oldName, newName: args.newName },
      'installation renamed',
    );
  }

  // Spec 0051: `rotatePem()` removed. PEM rotation is handled by
  // uninstalling the App and reinstalling it (a rare event).

  /**
   * Tear down the App entirely: stop refresh, clear cache, drop every
   * installation entry. Caller is responsible for the DB delete (CASCADE
   * on `connector_apps`).
   *
   * Spec 0051: env-var clearing removed (operator-picked envVar dropped).
   */
  appUninstall(): void {
    this.stop();
    this.installations.clear();
    this.cache.clear();
    logger.info({ event: 'github_app_uninstalled' }, 'GitHub App fully uninstalled');
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private async refreshAll(): Promise<void> {
    // Spec 0048 Q4: log noise reduction. Routine-success refreshes are
    // silent. Logs fire on:
    //   - first-time success per installation (init)
    //   - failure
    //   - recovery (failure → success)
    //   - one cycle-complete aggregate
    let primaryToken: string | null = null;
    let succeeded = 0;
    let failed = 0;
    let aggregateError: string | null = null;
    for (const inst of this.installations.values()) {
      const previousState = this.lastRefreshState.get(inst.name) ?? 'unknown';
      try {
        const token = await this.mintAndCache(inst);
        if (!primaryToken) primaryToken = token;
        succeeded += 1;
        if (previousState === 'unknown') {
          logger.info(
            { event: 'github_app_token_initialized', installation: inst.name },
            'installation token initialized',
          );
        } else if (previousState === 'failed') {
          logger.info(
            { event: 'github_app_token_refresh_recovered', installation: inst.name },
            'installation token recovered after prior failure',
          );
        }
        this.lastRefreshState.set(inst.name, 'success');
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        aggregateError = message;
        logger.warn(
          {
            event: 'github_app_token_refresh_failed',
            installation: inst.name,
            err: message,
          },
          'failed to refresh installation token',
        );
        this.lastRefreshState.set(inst.name, 'failed');
        // Spec 0048 Q3: kick off the exponential-backoff retry chain.
        if (!this.disableAutoRefresh) {
          this.scheduleRetry(inst);
        }
      }
    }
    // Spec 0051: `process.env.GH_TOKEN = primaryToken` removed alongside
    // operator-picked envVar field. The github-mcp-server subprocess
    // receives `GITHUB_PERSONAL_ACCESS_TOKEN` via mcp-build.ts (synthesized
    // from getCachedToken); no global env var is needed.
    void primaryToken;
    // Spec 0048 Q4: single aggregate log per cycle (cheap).
    logger.info(
      {
        event: 'github_app_refresh_cycle_complete',
        succeeded,
        failed,
        total: this.installations.size,
      },
      'github app refresh cycle complete',
    );
    // Spec 0048 Q2: notify the caller so connector_apps.last_refresh_error_at
    // can be updated. Single timestamp covers all installations (degraded =
    // any installation refresh failed in the last hour).
    if (this.onRefreshResult) {
      this.onRefreshResult({
        success: failed === 0,
        errorMessage: failed > 0 ? aggregateError : null,
      });
    }
  }

  /**
   * Mint + cache. Spec 0051: `process.env[installation.envVar] = token`
   * write removed (no consumers).
   */
  private async mintAndCache(installation: Installation): Promise<string> {
    const jwt = signAppJwt({ appId: this.appId, privateKey: this.privateKey });
    const minted = await mintInstallationToken(jwt, installation.id);
    this.cache.set(installation.name, {
      token: minted.token,
      expiresAt: new Date(minted.expiresAt),
    });
    return minted.token;
  }
}

// ─── DB loader ────────────────────────────────────────────────────────────

export interface LoadGitHubAppDeps {
  connectors: ConnectorRepo;
  connectorApps: ConnectorAppRepo;
}

/**
 * Load GitHub App config from DB. Spec 0044.
 *
 * 1. Look up the single `connector_apps` row for catalog_id='github-app'.
 * 2. Backfill `app_slug` / `app_name` / `pem_sha256` if migration left them
 *    blank (post-migration first boot path).
 * 3. Read all `github-app-*` connectors that point at this app.
 * 4. Build a `GitHubAppAuth` instance (stateless until `bootstrap()`).
 *
 * Returns null if no App row exists (fresh deploy, before any install).
 *
 * Throws on a fatal config error (App row exists but installation rows are
 * incomplete in a way the caller cannot recover from). Most failure modes
 * are warned + skipped to keep the worker booting.
 */
export async function loadGitHubAppFromDb(deps: LoadGitHubAppDeps): Promise<GitHubAppAuth | null> {
  const app = deps.connectorApps.getOneByCatalog('github-app');
  if (!app) return null;

  // Post-migration backfill: app_slug/app_name/pem_sha256 may be empty.
  let appSlug = app.appSlug;
  let appName = app.appName;
  let pemSha256 = app.pemSha256;
  if (!appSlug || !appName || !pemSha256) {
    try {
      const jwt = signAppJwt({ appId: app.appId, privateKey: app.pem });
      const meta = await fetchAppMetadata(jwt);
      appSlug = meta.slug;
      appName = meta.name;
      pemSha256 = computePemSha256(app.pem);
      deps.connectorApps.update(app.id, { appSlug, appName, pemSha256 });
      logger.info(
        { event: 'github_app_metadata_backfilled', appId: app.appId, slug: appSlug },
        'connector_apps metadata backfilled',
      );
    } catch (err) {
      const kind = err instanceof GitHubAppError ? err.kind : 'unknown';
      logger.warn(
        { event: 'github_app_metadata_backfill_failed', appId: app.appId, err: String(err), kind },
        'failed to backfill connector_apps metadata; continuing with empty fields',
      );
    }
  }

  // Read every github-app-* connector + secrets.
  // Spec 0051: env_var reserved key removed; only installation_id + name needed.
  const installations: Installation[] = [];
  const all = deps.connectors.getEnabledWithRelations();
  for (const { connector, secrets } of all) {
    if (connector.appId !== app.id) continue;
    const map = new Map(secrets.map((s) => [s.key, s.value]));
    const instId = map.get(GITHUB_APP_RESERVED_KEYS.INSTALLATION_ID);
    const instName = map.get(GITHUB_APP_RESERVED_KEYS.INSTALLATION_NAME);
    if (!instId || !instName) {
      logger.warn(
        {
          event: 'github_app_db_row_incomplete',
          slug: connector.slug,
          missing: [!instId && 'installation_id', !instName && 'installation_name'].filter(Boolean),
        },
        'skipping incomplete github-app connector row',
      );
      continue;
    }
    installations.push({ name: instName, id: instId });
  }

  logger.info(
    {
      event: 'github_app_config_loaded_from_db',
      appId: app.appId,
      installations: installations.map((i) => i.name),
    },
    'github_app config loaded from DB',
  );

  return new GitHubAppAuth({
    appId: app.appId,
    privateKey: app.pem,
    installations,
    // Spec 0048 Q2: refresh failures land on connector_apps.last_refresh_*
    // so the dashboard can render the DEGRADED pill. Successes clear the
    // fields. The 1-hour staleness window is computed at read-time in the
    // listing endpoint.
    onRefreshResult: ({ success, errorMessage }) => {
      if (success) {
        deps.connectorApps.update(app.id, {
          lastRefreshErrorAt: null,
          lastRefreshErrorMessage: null,
        });
      } else {
        deps.connectorApps.update(app.id, {
          lastRefreshErrorAt: new Date().toISOString(),
          lastRefreshErrorMessage: errorMessage?.slice(0, 500) ?? 'unknown error',
        });
      }
    },
  });
}
