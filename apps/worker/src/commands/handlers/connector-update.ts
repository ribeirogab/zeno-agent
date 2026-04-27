import { discoverTools } from '@zeno/mcp-discover';
import type { ConnectorRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';

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
  secrets: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
});

export function buildConnectorUpdateHandler(connectors: ConnectorRepo): Handler {
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };
    const { id, patch, secrets } = parsed.data;
    const connector = connectors.get(id);
    if (!connector) return { ok: false, error: 'connector_not_found' };

    if (patch && Object.keys(patch).length > 0) {
      connectors.update(id, patch);
    }
    if (secrets !== undefined) {
      connectors.replaceSecrets(id, secrets);
      // Internal test on the new credentials. Inherits the 10s timeout from
      // discoverTools — acceptable at single-user scale (rare event, single connector).
      const refreshed = connectors.get(id);
      if (refreshed) {
        const result = await discoverTools(refreshed, connectors.getSecrets(id));
        if ('error' in result) {
          connectors.update(id, {
            lastError: result.error,
            lastErrorAt: new Date().toISOString(),
          });
        } else {
          connectors.update(id, {
            lastError: null,
            lastErrorAt: null,
            lastVerifiedAt: new Date().toISOString(),
          });
        }
      }
    }

    return { ok: true };
  };
}
