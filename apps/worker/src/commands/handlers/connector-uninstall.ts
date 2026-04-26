import type { ConnectorRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';

const payloadSchema = z.object({ id: z.string() });

export function buildConnectorUninstallHandler(connectors: ConnectorRepo): Handler {
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };
    const removed = connectors.delete(parsed.data.id);
    if (!removed) return { ok: false, error: 'connector_not_found' };
    return { ok: true };
  };
}
