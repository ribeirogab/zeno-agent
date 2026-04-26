import { discoverTools } from '@zeno/mcp-discover';
import type { ConnectorRepo, ToolCategory, ToolPermission } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';

const payloadSchema = z.object({ id: z.string() });

const DEFAULTS: Record<ToolCategory, ToolPermission> = {
  read: 'always_allow',
  write: 'ask',
  interactive: 'ask',
};

export function buildConnectorRefreshToolsHandler(connectors: ConnectorRepo): Handler {
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };
    const { id } = parsed.data;
    const connector = connectors.get(id);
    if (!connector) return { ok: false, error: 'connector_not_found' };

    const result = await discoverTools(connector, connectors.getSecrets(id));
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
