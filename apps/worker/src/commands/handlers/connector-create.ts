import { createLogger } from '@zeno/logger';
import type { ConnectorRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';
import type { HandlerDeps } from '@/commands/handlers';
import { GITHUB_APP_RESERVED_KEYS } from '@/github/app-auth';

const logger = createLogger({ service: 'worker' });

const toolSchema = z.object({
  toolName: z.string(),
  description: z.string().nullable(),
  category: z.enum(['read', 'write', 'interactive']),
  permission: z.enum(['always_allow', 'ask', 'never']),
});

const secretSchema = z.object({
  key: z.string(),
  value: z.string(),
  isPublic: z.boolean().optional(),
});

const catalogSchema = z.object({
  source: z.literal('catalog'),
  catalogId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  description: z.string().nullable().optional(),
  transport: z.enum(['stdio', 'remote']),
  command: z.string().nullable().optional(),
  args: z.array(z.string()).nullable().optional(),
  url: z.string().nullable().optional(),
  secrets: z.array(secretSchema),
  tools: z.array(toolSchema),
  /** Spec 0044: github-app-* connectors carry the FK to connector_apps.id. */
  appId: z.string().nullable().optional(),
});

const customSchema = z.object({
  source: z.literal('custom'),
  slug: z.string(),
  displayName: z.string(),
  transport: z.enum(['stdio', 'remote']),
  command: z.string().nullable().optional(),
  args: z.array(z.string()).nullable().optional(),
  url: z.string().nullable().optional(),
  secrets: z.array(secretSchema),
  tools: z.array(toolSchema),
});

const payloadSchema = z.discriminatedUnion('source', [catalogSchema, customSchema]);

type Deps = Pick<HandlerDeps, 'connectors' | 'getGithubApp'>;

export function buildConnectorCreateHandler(deps: Deps): Handler;
// Backwards-compatible factory accepting just the repo (for existing tests).
export function buildConnectorCreateHandler(connectors: ConnectorRepo): Handler;
export function buildConnectorCreateHandler(arg: Deps | ConnectorRepo): Handler {
  const deps: Deps =
    'connectors' in (arg as Deps)
      ? (arg as Deps)
      : { connectors: arg as ConnectorRepo, getGithubApp: () => null };
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };
    const data = parsed.data;
    try {
      // Custom connectors with no test → land as `pending`. Catalog and tested
      // customs land as `enabled` (the API only enqueues create after a successful test).
      const status = data.source === 'custom' && data.tools.length === 0 ? 'pending' : 'enabled';
      const created = deps.connectors.create({
        slug: data.slug,
        displayName: data.displayName,
        description: 'description' in data ? (data.description ?? null) : null,
        source: data.source,
        catalogId: data.source === 'catalog' ? data.catalogId : null,
        transport: data.transport,
        command: data.command ?? null,
        args: data.args ?? null,
        url: data.url ?? null,
        status,
        secrets: data.secrets,
        tools: data.tools,
        appId: data.source === 'catalog' ? (data.appId ?? null) : null,
      });

      // Spec 0044: github-app-* connector → register installation in the
      // running GitHubAppAuth singleton so its token gets minted without a
      // worker restart.
      if (data.source === 'catalog' && data.slug.startsWith('github-app-')) {
        const githubApp = deps.getGithubApp();
        if (!githubApp) {
          logger.warn(
            { event: 'connector_create_no_github_app', slug: data.slug },
            'connector_create for github-app-* but GitHubAppAuth singleton is null',
          );
        } else {
          const map = new Map(data.secrets.map((s) => [s.key, s.value]));
          const id = map.get(GITHUB_APP_RESERVED_KEYS.INSTALLATION_ID);
          const name = map.get(GITHUB_APP_RESERVED_KEYS.INSTALLATION_NAME);
          const envVar = map.get(GITHUB_APP_RESERVED_KEYS.ENV_VAR);
          if (id && name && envVar) {
            await githubApp.addInstallation({ id, name, envVar });
          } else {
            logger.warn(
              { event: 'connector_create_github_app_secrets_missing', slug: data.slug },
              'github-app-* secrets are incomplete; skipping addInstallation',
            );
          }
        }
        // Spec 0050: the auto-rule creation that lived here (spec 0047) is
        // gone with the rest of the approval-rules infrastructure.
      }
      return { ok: true, data: { connectorId: created.id, slug: created.slug } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `failed to create connector: ${message}` };
    }
  };
}
