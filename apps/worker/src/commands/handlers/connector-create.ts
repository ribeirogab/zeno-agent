import type { ConnectorRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';

const toolSchema = z.object({
  toolName: z.string(),
  description: z.string().nullable(),
  category: z.enum(['read', 'write', 'interactive']),
  permission: z.enum(['always_allow', 'ask', 'never']),
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
  secrets: z.array(z.object({ key: z.string(), value: z.string() })),
  tools: z.array(toolSchema),
});

const customSchema = z.object({
  source: z.literal('custom'),
  slug: z.string(),
  displayName: z.string(),
  transport: z.enum(['stdio', 'remote']),
  command: z.string().nullable().optional(),
  args: z.array(z.string()).nullable().optional(),
  url: z.string().nullable().optional(),
  secrets: z.array(z.object({ key: z.string(), value: z.string() })),
  tools: z.array(toolSchema),
});

const payloadSchema = z.discriminatedUnion('source', [catalogSchema, customSchema]);

export function buildConnectorCreateHandler(connectors: ConnectorRepo): Handler {
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };
    const data = parsed.data;
    try {
      // Custom connectors with no test → land as `pending`. Catalog and tested
      // customs land as `enabled` (the API only enqueues create after a successful test).
      const status = data.source === 'custom' && data.tools.length === 0 ? 'pending' : 'enabled';
      const created = connectors.create({
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
      });
      return { ok: true, data: { connectorId: created.id, slug: created.slug } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `failed to create connector: ${message}` };
    }
  };
}
