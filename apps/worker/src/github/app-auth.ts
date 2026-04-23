import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLogger } from '@zeno/logger';
import { parse as parseYaml } from 'yaml';

const logger = createLogger({ service: 'worker' });

const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

interface Installation {
  name: string;
  id: string;
  envVar: string;
}

interface GitHubAppAuthOptions {
  appId: string;
  privateKeyPath: string;
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
    this.privateKey = readFileSync(opts.privateKeyPath, 'utf8');
    this.installations = opts.installations;
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
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Load GitHub App config from agent/ (shared base: app_id, key, git_identity)
 * and profile/ (installations). Profile fields override agent fields when both
 * are present. Paths (private_key_file) resolve relative to the layer that
 * provides them.
 */
export function loadGitHubAppConfig(): GitHubAppAuth | null {
  const agentLayer = loadGitHubAppLayer(AGENT_CANDIDATES);
  const profileLayer = loadGitHubAppLayer(PROFILE_CANDIDATES);

  if (!agentLayer && !profileLayer) return null;

  const agentCfg = agentLayer?.config ?? {};
  const profileCfg = profileLayer?.config ?? {};

  const appId = profileCfg.app_id ?? agentCfg.app_id;
  const privateKeyFile = profileCfg.private_key_file ?? agentCfg.private_key_file;
  const keyBase = profileCfg.private_key_file
    ? profileLayer?.base
    : agentLayer?.base;
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
    'github_app config loaded',
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
