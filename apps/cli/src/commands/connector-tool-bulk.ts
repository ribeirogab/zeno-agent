import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { runCommand } from '../lib/errors.js';
import { ok, setQuiet } from '../lib/output.js';
import {
  resolveConnector,
  resolvePermission,
  resolveProfile,
  resolveToolCategory,
} from '../lib/resolvers.js';

const CATEGORIES = ['read', 'write', 'interactive'] as const;
const PERMISSIONS = ['always_allow', 'ask', 'never'] as const;
type Category = (typeof CATEGORIES)[number];
type Permission = (typeof PERMISSIONS)[number];

interface ToolBulkArgs {
  target: string;
  category: string;
  permission: string;
}

interface ConnectorDetail {
  id: string;
}

type ToolBulkClient = Pick<ApiClient, 'get' | 'patch'>;

/**
 * Resolve the connector by slug-or-id, then PATCH
 * `/api/connectors/<id>/tools/permissions/bulk` with `{ category, permission }`.
 * The endpoint returns `{ rowsAffected }`; print outcome.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 13.
 */
export async function runConnectorToolBulk(
  client: ToolBulkClient,
  args: ToolBulkArgs,
  print: (line: string) => void,
): Promise<void> {
  if (!(CATEGORIES as readonly string[]).includes(args.category)) {
    throw new Error('category must be read|write|interactive');
  }
  if (!(PERMISSIONS as readonly string[]).includes(args.permission)) {
    throw new Error('permission must be always_allow|ask|never');
  }
  const detail = await client.get<ConnectorDetail>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  const result = (await client.patch(`/api/connectors/${detail.id}/tools/permissions/bulk`, {
    category: args.category as Category,
    permission: args.permission as Permission,
  })) as { rowsAffected: number };
  print(ok(`${result.rowsAffected} tools (category=${args.category}) → ${args.permission}`));
}

export default defineCommand({
  meta: { name: 'bulk', description: 'set permission for all tools in a category' },
  args: {
    // All three are optional positionals so the picker can fill them in. The
    // earlier `required: true` form forced citty to error before the CLI even
    // entered `run()` — the same defeat-the-picker bug we hit on
    // `profile edit --port` (commit bb7f992).
    target: { type: 'positional', description: 'slug or id', required: false },
    category: {
      type: 'string',
      description: 'read | write | interactive (prompted if omitted)',
      required: false,
    },
    permission: {
      type: 'string',
      description: 'always_allow | ask | never (prompted if omitted)',
      required: false,
    },
    profile: { type: 'string', description: 'profile name', required: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    const target = await resolveConnector(args.target as string | undefined, {
      listConnectors: () => client.get('/api/connectors'),
    });
    const category = await resolveToolCategory(args.category as string | undefined);
    const permission = await resolvePermission(args.permission as string | undefined);
    await runCommand(() =>
      runConnectorToolBulk(
        client,
        {
          target,
          category,
          permission,
        },
        (line) => console.log(line),
      ),
    );
  },
});
