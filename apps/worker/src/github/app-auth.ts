/**
 * GitHubAppAuth — stateful wrapper around `@zeno/github-app` primitives.
 * Spec 0042 (creation) → spec 0044 (refactor + surgical mutations).
 *
 * The class holds:
 *   - one App credential set (`appId`, `pem`)
 *   - N installations (`{name, id, envVar}`)
 *   - a per-installation token cache + auto-refresh interval
 *
 * Five surgical mutations let the dashboard mutate state without restarting
 * the worker:
 *   - addInstallation     → bootstrap a token for one new installation
 *   - removeInstallation  → drop cache + unset env var
 *   - renameInstallation  → preserve token cache, re-alias env var only
 *   - rotatePem           → swap key in memory, invalidate ALL caches
 *   - appUninstall        → tear-down (cache, env vars, refresh interval)
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

// Reserved secret keys for github-app-* connectors.
// Spec 0042 had 5; spec 0044 drops APP_ID + PEM (now on connector_apps).
export const GITHUB_APP_RESERVED_KEYS = {
  INSTALLATION_ID: '__GITHUB_INSTALLATION_ID__',
  INSTALLATION_NAME: '__GITHUB_INSTALLATION_NAME__',
  ENV_VAR: '__GITHUB_ENV_VAR__',
} as const;

export interface Installation {
  name: string;
  id: string;
  envVar: string;
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
}

export class GitHubAppAuth {
  private appId: string;
  private privateKey: string;
  private readonly installations: Map<string, Installation> = new Map();
  private readonly cache: Map<string, CachedToken> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly disableAutoRefresh: boolean;

  constructor(opts: GitHubAppAuthOptions) {
    this.appId = opts.appId;
    this.privateKey = opts.privateKey;
    for (const inst of opts.installations) {
      this.installations.set(inst.name, inst);
    }
    this.disableAutoRefresh = opts.disableAutoRefresh ?? false;
  }

  // ─── Read API ───────────────────────────────────────────────────────────

  /**
   * Sync read of a cached installation token. Returns null if cache empty
   * or token within the refresh margin (5 min). Used by `mcp-build.ts` to
   * stay synchronous with the SDK getter contract.
   */
  getCachedToken(installationName: string): string | null {
    const cached = this.cache.get(installationName);
    if (!cached) return null;
    if (cached.expiresAt.getTime() - Date.now() <= TOKEN_REFRESH_MARGIN_MS) return null;
    return cached.token;
  }

  /** Spec 0044: invalidate one cached token (callable from outside). */
  invalidateCache(installationName: string): void {
    this.cache.delete(installationName);
  }

  /** Async: cached token if valid, else mint a fresh one. */
  async getToken(installationName: string): Promise<string | null> {
    const cached = this.cache.get(installationName);
    if (cached && cached.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return cached.token;
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
   * Remove one installation: drop cache, clear env var, drop in-memory entry.
   */
  removeInstallation(name: string): void {
    const inst = this.installations.get(name);
    if (!inst) {
      logger.warn(
        { event: 'github_app_remove_installation_not_found', name },
        'removeInstallation called with an unknown name',
      );
      return;
    }
    this.cache.delete(name);
    delete process.env[inst.envVar];
    this.installations.delete(name);
    logger.info({ event: 'github_app_installation_removed', name }, 'installation removed');
  }

  /**
   * Rename an installation OR change its env var. Preserves the cached token
   * (the underlying GitHub installation is the same — only the alias name and/
   * or env var change). Updates `process.env` to point the new env var at the
   * cached token; deletes the old env var.
   *
   * If `oldName !== newName`, the cache key is moved.
   */
  renameInstallation(args: {
    oldName: string;
    newName: string;
    oldEnvVar: string;
    newEnvVar: string;
  }): void {
    const inst = this.installations.get(args.oldName);
    if (!inst) {
      logger.warn(
        { event: 'github_app_rename_installation_not_found', name: args.oldName },
        'renameInstallation called with an unknown name',
      );
      return;
    }
    // Move the cache entry if the name changed
    if (args.oldName !== args.newName) {
      const cached = this.cache.get(args.oldName);
      if (cached) {
        this.cache.set(args.newName, cached);
        this.cache.delete(args.oldName);
      }
      this.installations.delete(args.oldName);
    }
    const updated: Installation = { ...inst, name: args.newName, envVar: args.newEnvVar };
    this.installations.set(args.newName, updated);
    // Move env var
    if (args.oldEnvVar !== args.newEnvVar) {
      const tok = this.cache.get(args.newName)?.token;
      if (tok) {
        process.env[args.newEnvVar] = tok;
      }
      delete process.env[args.oldEnvVar];
    }
    logger.info(
      { event: 'github_app_installation_renamed', oldName: args.oldName, newName: args.newName },
      'installation renamed',
    );
  }

  /**
   * Atomically swap the in-memory PEM, invalidate ALL cached tokens, then
   * re-mint asynchronously. Caller is responsible for persisting the new PEM
   * to `connector_apps.pem` BEFORE calling this method (so a refresh failure
   * doesn't leave us with a key the DB doesn't know about).
   *
   * `appUninstall` semantics: rotatePem on the same App keeps installations
   * registered; only the credential changes.
   */
  async rotatePem(newPem: string): Promise<void> {
    this.privateKey = newPem;
    this.cache.clear();
    // Re-mint all installations in parallel; tolerate failures.
    const results = await Promise.allSettled(
      [...this.installations.values()].map((inst) => this.mintAndCache(inst)),
    );
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? this.installationByIndex(i) : null))
      .filter((x): x is string => x !== null);
    logger.info(
      { event: 'github_app_pem_rotated', failedInstallations: failed },
      'PEM rotated; caches invalidated',
    );
  }

  /**
   * Tear down the App entirely: stop refresh, clear cache, unset every env
   * var, drop every installation entry. Caller is responsible for the DB
   * delete (CASCADE on `connector_apps`).
   */
  appUninstall(): void {
    this.stop();
    for (const inst of this.installations.values()) {
      delete process.env[inst.envVar];
    }
    this.installations.clear();
    this.cache.clear();
    delete process.env.GH_TOKEN;
    logger.info({ event: 'github_app_uninstalled' }, 'GitHub App fully uninstalled');
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private installationByIndex(index: number): string | null {
    return [...this.installations.keys()][index] ?? null;
  }

  private async refreshAll(): Promise<void> {
    let primaryToken: string | null = null;
    for (const inst of this.installations.values()) {
      try {
        const token = await this.mintAndCache(inst);
        if (!primaryToken) primaryToken = token;
        logger.info(
          { event: 'github_app_token_refreshed', installation: inst.name },
          'installation token refreshed',
        );
      } catch (err) {
        logger.error(
          { event: 'github_app_token_failed', installation: inst.name, err: String(err) },
          'failed to refresh installation token',
        );
      }
    }
    if (primaryToken) {
      process.env.GH_TOKEN = primaryToken;
    }
  }

  /** Mint + cache + set env var. Throws on failure. */
  private async mintAndCache(installation: Installation): Promise<string> {
    const jwt = signAppJwt({ appId: this.appId, privateKey: this.privateKey });
    const minted = await mintInstallationToken(jwt, installation.id);
    this.cache.set(installation.name, {
      token: minted.token,
      expiresAt: new Date(minted.expiresAt),
    });
    process.env[installation.envVar] = minted.token;
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
  const installations: Installation[] = [];
  const all = deps.connectors.getEnabledWithRelations();
  for (const { connector, secrets } of all) {
    if (connector.appId !== app.id) continue;
    const map = new Map(secrets.map((s) => [s.key, s.value]));
    const instId = map.get(GITHUB_APP_RESERVED_KEYS.INSTALLATION_ID);
    const instName = map.get(GITHUB_APP_RESERVED_KEYS.INSTALLATION_NAME);
    const envVar = map.get(GITHUB_APP_RESERVED_KEYS.ENV_VAR);
    if (!instId || !instName || !envVar) {
      logger.warn(
        {
          event: 'github_app_db_row_incomplete',
          slug: connector.slug,
          missing: [
            !instId && 'installation_id',
            !instName && 'installation_name',
            !envVar && 'env_var',
          ].filter(Boolean),
        },
        'skipping incomplete github-app connector row',
      );
      continue;
    }
    installations.push({ name: instName, id: instId, envVar });
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
  });
}
