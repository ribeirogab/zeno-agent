import type {
  ConnectorRepo,
  ConnectorSecret,
  ToolCategory,
  ToolPermission,
} from '@zeno/db/runtime';
import { createLogger } from '@zeno/logger';
import { discoverTools } from '@zeno/mcp-discover';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';
import { GITHUB_APP_RESERVED_KEYS, type GitHubAppAuth } from '@/github/app-auth';

const logger = createLogger({ service: 'worker' });

const payloadSchema = z.object({ id: z.string() });

const DEFAULTS: Record<ToolCategory, ToolPermission> = {
  read: 'always_allow',
  write: 'ask',
  interactive: 'ask',
};

interface Deps {
  connectors: ConnectorRepo;
  /** Spec 0044: optional getter for the github-app singleton (intercept). */
  getGithubApp?: () => GitHubAppAuth | null;
}

export function buildConnectorRefreshToolsHandler(deps: Deps): Handler;
export function buildConnectorRefreshToolsHandler(connectors: ConnectorRepo): Handler;
export function buildConnectorRefreshToolsHandler(arg: Deps | ConnectorRepo): Handler {
  const deps: Deps =
    'connectors' in (arg as Deps) ? (arg as Deps) : { connectors: arg as ConnectorRepo };
  const { connectors } = deps;

  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };
    const { id } = parsed.data;
    const connector = connectors.get(id);
    if (!connector) return { ok: false, error: 'connector_not_found' };

    // Spec 0044: github-app-* intercept — discoverTools needs a real
    // GITHUB_PERSONAL_ACCESS_TOKEN secret, not the reserved __GITHUB_*__
    // keys (those are for the runtime spawn path). Synthesize one from the
    // installation token cache.
    let secrets: ConnectorSecret[] = connectors.getSecrets(id);
    if (connector.slug.startsWith('github-app-')) {
      const githubApp = deps.getGithubApp?.() ?? null;
      if (!githubApp) {
        return {
          ok: false,
          error: 'github_app_not_loaded — install via dashboard before refresh-tools',
        };
      }
      const map = new Map(secrets.map((s) => [s.key, s.value]));
      const installationName = map.get(GITHUB_APP_RESERVED_KEYS.INSTALLATION_NAME);
      if (!installationName) {
        return { ok: false, error: 'github_app_installation_name_missing' };
      }
      let token = githubApp.getCachedToken(installationName);
      if (!token) {
        try {
          const fresh = await githubApp.getToken(installationName);
          if (!fresh) {
            return { ok: false, error: `github_app_installation_unknown: ${installationName}` };
          }
          token = fresh;
        } catch (err) {
          logger.error(
            {
              event: 'connector_refresh_github_app_mint_failed',
              slug: connector.slug,
              err: String(err),
            },
            'failed to mint installation token for refresh-tools',
          );
          return {
            ok: false,
            error: `github_app_token_mint_failed: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }
      secrets = [
        {
          connectorId: connector.id,
          key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
          value: token,
        },
      ];
    }

    const result = await discoverTools(connector, secrets);
    if ('error' in result) {
      connectors.update(id, {
        lastError: result.error,
        lastErrorAt: new Date().toISOString(),
      });
      return { ok: false, error: result.error };
    }

    connectors.replaceTools(
      id,
      result.tools.map((t) => ({
        toolName: t.name,
        description: t.description,
        category: t.category,
        permission: DEFAULTS[t.category],
      })),
    );
    connectors.update(id, {
      lastError: null,
      lastErrorAt: null,
      lastVerifiedAt: new Date().toISOString(),
    });

    return { ok: true, data: { count: result.tools.length } };
  };
}
