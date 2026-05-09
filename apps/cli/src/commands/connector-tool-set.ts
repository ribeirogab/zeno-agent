import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { ok } from '../lib/output.js';
import {
  resolveConnector,
  resolvePermission,
  resolveProfile,
  resolveTool,
} from '../lib/resolvers.js';

const PERMISSIONS = ['always_allow', 'ask', 'never'] as const;
type Permission = (typeof PERMISSIONS)[number];

interface ToolSetArgs {
  target: string;
  tool: string;
  permission: string;
}

interface ConnectorDetail {
  id: string;
}

type ToolSetClient = Pick<ApiClient, 'get' | 'patch'>;

/**
 * Resolve the connector by slug-or-id, then PATCH
 * `/api/connectors/<id>/tools/<tool>/permission` with `{ permission }`.
 * The endpoint returns 204; print a one-line confirmation.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 13.
 */
export async function runConnectorToolSet(
  client: ToolSetClient,
  args: ToolSetArgs,
  print: (line: string) => void,
): Promise<void> {
  if (!(PERMISSIONS as readonly string[]).includes(args.permission)) {
    throw new Error('permission must be always_allow|ask|never');
  }
  const detail = await client.get<ConnectorDetail>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  await client.patch(
    `/api/connectors/${detail.id}/tools/${encodeURIComponent(args.tool)}/permission`,
    { permission: args.permission as Permission },
  );
  print(ok(`${args.tool} → ${args.permission}`));
}

export default defineCommand({
  meta: { name: 'set', description: 'set permission for a single tool' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: false },
    tool: { type: 'positional', description: 'tool name', required: false },
    permission: {
      type: 'positional',
      description: 'always_allow | ask | never',
      required: false,
    },
    profile: { type: 'string', description: 'profile name', required: false },
  },
  async run({ args }) {
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    const target = await resolveConnector(args.target as string | undefined, {
      listConnectors: () => client.get('/api/connectors'),
    });
    const tool = await resolveTool(args.tool as string | undefined, {
      listTools: async () => {
        const detail = await client.get<{ tools?: { toolName: string }[] }>(
          `/api/connectors/${encodeURIComponent(target)}`,
        );
        return (detail.tools ?? []).map((t) => ({ name: t.toolName }));
      },
    });
    const permission = await resolvePermission(args.permission as string | undefined);
    await runConnectorToolSet(
      client,
      { target, tool, permission },
      (line) => console.log(line),
    );
  },
});
