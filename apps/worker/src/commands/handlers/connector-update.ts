import { createLogger } from '@zeno/logger';
import { discoverTools } from '@zeno/mcp-discover';
import type { ConnectorRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';
import type { HandlerDeps } from '@/commands/handlers';
import { GITHUB_APP_RESERVED_KEYS } from '@/github/app-auth';

const logger = createLogger({ service: 'worker' });

const payloadSchema = z.object({
  id: z.string(),
  patch: z
    .object({
      displayName: z.string().optional(),
      description: z.string().nullable().optional(),
      command: z.string().nullable().optional(),
      args: z.array(z.string()).nullable().optional(),
      url: z.string().nullable().optional(),
    })
    .optional(),
  secrets: z
    .array(z.object({ key: z.string(), value: z.string(), isPublic: z.boolean().optional() }))
    .optional(),
});

type Deps = Pick<HandlerDeps, 'connectors' | 'getGithubApp'>;

export function buildConnectorUpdateHandler(deps: Deps): Handler;
export function buildConnectorUpdateHandler(connectors: ConnectorRepo): Handler;
export function buildConnectorUpdateHandler(arg: Deps | ConnectorRepo): Handler {
  const deps: Deps =
    'connectors' in (arg as Deps)
      ? (arg as Deps)
      : { connectors: arg as ConnectorRepo, getGithubApp: () => null };
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };
    const { id, patch, secrets } = parsed.data;
    const connector = deps.connectors.get(id);
    if (!connector) return { ok: false, error: 'connector_not_found' };

    // Spec 0051: M11 envVar rename branch removed. Capture only oldName so
    // a renameInstallation can fire if the operator updates the
    // installation name (rare; M11's UI is gone but a future spec could
    // reintroduce a name-only rename).
    let oldName: string | null = null;
    if (connector.slug.startsWith('github-app-')) {
      const before = deps.connectors.getSecrets(id);
      oldName =
        before.find((s) => s.key === GITHUB_APP_RESERVED_KEYS.INSTALLATION_NAME)?.value ?? null;
    }

    if (patch && Object.keys(patch).length > 0) {
      deps.connectors.update(id, patch);
    }
    if (secrets !== undefined) {
      deps.connectors.replaceSecrets(id, secrets);

      // Spec 0044: if this is a github-app-* connector, surgically update the
      // singleton instead of re-running discoverTools (the github-app slugs
      // pull tools from the catalog, not from the live MCP — and discoverTools
      // would fail anyway since the secrets shape is reserved).
      if (connector.slug.startsWith('github-app-')) {
        const githubApp = deps.getGithubApp();
        const map = new Map(secrets.map((s) => [s.key, s.value]));
        const newName = map.get(GITHUB_APP_RESERVED_KEYS.INSTALLATION_NAME) ?? oldName ?? null;
        if (githubApp && oldName && newName && oldName !== newName) {
          githubApp.renameInstallation({ oldName, newName });
        } else if (!githubApp) {
          logger.warn(
            { event: 'connector_update_no_github_app', slug: connector.slug },
            'connector_update for github-app-* but GitHubAppAuth singleton is null',
          );
        }
      } else {
        // Non-github-app connector: re-run discoverTools to validate new secrets.
        const refreshed = deps.connectors.get(id);
        if (refreshed) {
          const result = await discoverTools(refreshed, deps.connectors.getSecrets(id));
          if ('error' in result) {
            deps.connectors.update(id, {
              lastError: result.error,
              lastErrorAt: new Date().toISOString(),
            });
          } else {
            deps.connectors.update(id, {
              lastError: null,
              lastErrorAt: null,
              lastVerifiedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    return { ok: true };
  };
}
