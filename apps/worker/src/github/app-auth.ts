import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLogger } from '@zeno/logger';
import type { ConnectorRepo } from '@zeno/storage';
import { parse as parseYaml } from 'yaml';

const logger = createLogger({ service: 'worker' });

const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

// Reserved secret keys for github-app-* connectors. Spec 0042.
export const GITHUB_APP_RESERVED_KEYS = {
  APP_ID: '__GITHUB_APP_ID__',
  PEM: '__GITHUB_APP_PEM__',
  INSTALLATION_ID: '__GITHUB_INSTALLATION_ID__',
  INSTALLATION_NAME: '__GITHUB_INSTALLATION_NAME__',
  ENV_VAR: '__GITHUB_ENV_VAR__',
} as const;

interface Installation {
  name: string;
  id: string;
  envVar: string;
}

interface GitHubAppAuthOptions {
  appId: string;
  /** Either pass a pre-loaded PEM string (DB-sourced) or a path to a PEM file (yaml-sourced). */
  privateKey?: string;
  privateKeyPath?: string;
  installations: Installation[];
}

interface CachedToken {
  token: string;
  expiresAt: Date;
}

export class GitHubAppAuth {
  private readonly appId: string;
  private readonly privateKey: string;
  private readonly installations: Installation[];
  private readonly cache = new Map<string, CachedToken>();
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(opts: GitHubAppAuthOptions) {
    this.appId = opts.appId;
    if (opts.privateKey) {
      this.privateKey = opts.privateKey;
    } else if (opts.privateKeyPath) {
      this.privateKey = readFileSync(opts.privateKeyPath, 'utf8');
    } else {
      throw new Error('GitHubAppAuth: privateKey or privateKeyPath required');
    }
    this.installations = opts.installations;
  }

  /**
   * Sync read of a cached installation token. Returns null if cache is empty
   * or token is within the refresh margin (5 min). Used by `mcp-build.ts` to
   * stay synchronous (the SDK getter contract is sync). Spec 0042.
   */
  getCachedToken(installationName: string): string | null {
    const cached = this.cache.get(installationName);
    if (!cached) return null;
    if (cached.expiresAt.getTime() - Date.now() <= TOKEN_REFRESH_MARGIN_MS) return null;
    return cached.token;
  }

  /** Spec 0042: invalidate cached token (called from connector_update handler). */
  invalidateCache(installationName: string): void {
    this.cache.delete(installationName);
  }

  async bootstrap(): Promise<void> {
    await this.refreshAll();
    const intervalMs = 55 * 60_000;
    this.refreshTimer = setInterval(() => {
      this.refreshAll().catch((error) => {
        logger.error(
          { event: 'github_app_refresh_failed', err: String(error) },
          'failed to refresh GitHub App tokens',
        );
      });
    }, intervalMs);
    logger.info(
      { event: 'github_app_auth_started', installations: this.installations.map((i) => i.name) },
      'GitHub App auth started',
    );
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async getToken(installationName: string): Promise<string | null> {
    const cached = this.cache.get(installationName);
    if (cached && cached.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return cached.token;
    }
    const installation = this.installations.find((i) => i.name === installationName);
    if (!installation) return null;
    return this.fetchToken(installation);
  }

  private async refreshAll(): Promise<void> {
    let primaryToken: string | null = null;

    for (const installation of this.installations) {
      try {
        const token = await this.fetchToken(installation);
        process.env[installation.envVar] = token;
        if (!primaryToken) primaryToken = token;
        logger.info(
          { event: 'github_app_token_refreshed', installation: installation.name },
          'installation token refreshed',
        );
      } catch (error) {
        logger.error(
          { event: 'github_app_token_failed', installation: installation.name, err: String(error) },
          'failed to get installation token',
        );
      }
    }

    if (primaryToken) {
      process.env.GH_TOKEN = primaryToken;
    }
  }

  private async fetchToken(installation: Installation): Promise<string> {
    const jwt = this.createJWT();
    const response = await fetch(
      `https://api.github.com/app/installations/${installation.id}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API ${response.status}: ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as { token: string; expires_at: string };
    this.cache.set(installation.name, {
      token: data.token,
      expiresAt: new Date(data.expires_at),
    });
    return data.token;
  }

  private createJWT(): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iat: now - 60,
        exp: now + 600,
        iss: this.appId,
      }),
    ).toString('base64url');
    const signable = `${header}.${payload}`;

    const sign = createSign('RSA-SHA256');
    sign.update(signable);
    const signature = sign.sign(this.privateKey, 'base64url');
    return `${signable}.${signature}`;
  }
}

const AGENT_CANDIDATES = ['/app/agent', 'agent'];
const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

interface RawGitHubAppConfig {
  app_id?: string;
  private_key_file?: string;
  git_identity?: { name?: string; email?: string };
  installations?: { name: string; id: string; env_var: string }[];
}

interface RawInstallation {
  name: string;
  id: string;
  env_var: string;
}

function loadGitHubAppLayer(
  candidates: string[],
): { base: string; config: RawGitHubAppConfig } | null {
  for (const base of candidates) {
    const configPath = `${base}/config.yaml`;
    if (!existsSync(configPath)) continue;
    try {
      const raw = readFileSync(configPath, 'utf8');
      const parsed = parseYaml(raw) as Record<string, unknown> | null;
      if (!parsed?.github_app) continue;
      return { base, config: parsed.github_app as RawGitHubAppConfig };
    } catch {}
  }
  return null;
}

/**
 * Load GitHub App config. Spec 0042: prefer DB-sourced `github-app-*` connector
 * rows; fall back to legacy yaml + .pem during the migration window.
 *
 * If `connectorRepo` is provided and at least one `github-app-*` connector
 * exists, build the GitHubAppAuth from those rows. The first row's app_id +
 * pem are the source of truth (all rows share the same app credentials).
 *
 * Otherwise read agent/profile yaml as before.
 */
export function loadGitHubAppConfig(connectorRepo?: ConnectorRepo): GitHubAppAuth | null {
  if (connectorRepo) {
    const fromDb = loadGitHubAppFromDb(connectorRepo);
    if (fromDb) return fromDb;
  }
  return loadGitHubAppFromYaml();
}

function loadGitHubAppFromDb(connectorRepo: ConnectorRepo): GitHubAppAuth | null {
  const all = connectorRepo.getEnabledWithRelations();
  const appRows = all.filter((r) => r.connector.slug.startsWith('github-app-'));
  if (appRows.length === 0) return null;

  let appId: string | undefined;
  let pem: string | undefined;
  const installations: Installation[] = [];

  for (const { connector, secrets } of appRows) {
    const map = new Map(secrets.map((s) => [s.key, s.value]));
    const rowAppId = map.get(GITHUB_APP_RESERVED_KEYS.APP_ID);
    const rowPem = map.get(GITHUB_APP_RESERVED_KEYS.PEM);
    const instId = map.get(GITHUB_APP_RESERVED_KEYS.INSTALLATION_ID);
    const instName = map.get(GITHUB_APP_RESERVED_KEYS.INSTALLATION_NAME);
    const envVar = map.get(GITHUB_APP_RESERVED_KEYS.ENV_VAR);

    if (!rowAppId || !rowPem || !instId || !instName || !envVar) {
      logger.warn(
        {
          event: 'github_app_db_row_incomplete',
          slug: connector.slug,
          missing: [
            !rowAppId && 'app_id',
            !rowPem && 'pem',
            !instId && 'installation_id',
            !instName && 'installation_name',
            !envVar && 'env_var',
          ].filter(Boolean),
        },
        'skipping incomplete github-app connector row',
      );
      continue;
    }

    appId ??= rowAppId;
    pem ??= rowPem;
    if (rowAppId !== appId) {
      logger.warn(
        {
          event: 'github_app_id_mismatch',
          slug: connector.slug,
          expected: appId,
          got: rowAppId,
        },
        'github-app connector rows have different app_ids; using the first',
      );
    }

    installations.push({ name: instName, id: instId, envVar });
  }

  if (!appId || !pem || installations.length === 0) {
    logger.warn(
      { event: 'github_app_db_no_complete_rows' },
      'no complete github-app-* connector rows found',
    );
    return null;
  }

  logger.info(
    {
      event: 'github_app_config_loaded_from_db',
      installations: installations.map((i) => i.name),
    },
    'github_app config loaded from DB',
  );

  return new GitHubAppAuth({ appId, privateKey: pem, installations });
}

function loadGitHubAppFromYaml(): GitHubAppAuth | null {
  const agentLayer = loadGitHubAppLayer(AGENT_CANDIDATES);
  const profileLayer = loadGitHubAppLayer(PROFILE_CANDIDATES);

  if (!agentLayer && !profileLayer) return null;

  const agentCfg = agentLayer?.config ?? {};
  const profileCfg = profileLayer?.config ?? {};

  const appId = profileCfg.app_id ?? agentCfg.app_id;
  const privateKeyFile = profileCfg.private_key_file ?? agentCfg.private_key_file;
  const keyBase = profileCfg.private_key_file ? profileLayer?.base : agentLayer?.base;
  const installations: RawInstallation[] = [
    ...(agentCfg.installations ?? []),
    ...(profileCfg.installations ?? []),
  ];

  if (!appId || !privateKeyFile || installations.length === 0) {
    logger.warn(
      { event: 'github_app_config_incomplete' },
      'github_app section missing app_id, private_key_file, or installations across agent + profile configs',
    );
    return null;
  }

  const privateKeyPath = resolve(keyBase ?? '.', privateKeyFile);

  logger.info(
    {
      event: 'github_app_config_merged',
      agentLayer: !!agentLayer,
      profileLayer: !!profileLayer,
      installations: installations.length,
    },
    'github_app config loaded from yaml',
  );

  return new GitHubAppAuth({
    appId,
    privateKeyPath,
    installations: installations.map((inst) => ({
      name: inst.name,
      id: inst.id,
      envVar: inst.env_var,
    })),
  });
}
