import type { ConnectorRepo } from '@zeno/db/runtime';
import { discoverTools } from '@zeno/mcp-discover';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';
import type { HandlerDeps } from '@/commands/handlers';

const payloadSchema = z.object({
  id: z.string(),
  patch: z
    .object({
      displayName: z.string().optional(),
      description: z.string().nullable().optional(),
      command: z.string().nullable().optional(),
      args: z.array(z.string()).nullable().optional(),
      url: z.string().nullable().optional(),
      // Spec 2026-05-08-connectors-cli-first-design Q4: per-instance operator
      // label. `null` clears it, omitted leaves it untouched.
      instanceLabel: z.string().nullable().optional(),
    })
    .optional(),
  secrets: z
    .array(z.object({ key: z.string(), value: z.string(), isPublic: z.boolean().optional() }))
    .optional(),
});

type Deps = Pick<HandlerDeps, 'connectors'>;

export function buildConnectorUpdateHandler(deps: Deps): Handler;
export function buildConnectorUpdateHandler(connectors: ConnectorRepo): Handler;
export function buildConnectorUpdateHandler(arg: Deps | ConnectorRepo): Handler {
  const deps: Deps =
    'connectors' in (arg as Deps) ? (arg as Deps) : { connectors: arg as ConnectorRepo };
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };
    const { id, patch, secrets } = parsed.data;
    const connector = deps.connectors.get(id);
    if (!connector) return { ok: false, error: 'connector_not_found' };

    if (patch && Object.keys(patch).length > 0) {
      deps.connectors.update(id, patch);
    }
    if (secrets !== undefined) {
      deps.connectors.replaceSecrets(id, secrets);

      // Spec 0044: github-app-* connectors pull tools from the catalog (not
      // from a live MCP), and their secrets are reserved keys that
      // discoverTools can't validate. Skip the discovery call. Spec 0051
      // dropped the renameInstallation hook here — installation aliases are
      // immutable post-create.
      if (!connector.slug.startsWith('github-app-')) {
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
