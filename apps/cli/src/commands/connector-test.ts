import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { ok } from '../lib/output.js';
import { resolveConnector, resolveProfile } from '../lib/resolvers.js';

interface TestArgs {
  target: string;
}

interface ConnectorDetail {
  id: string;
}

interface TestResult {
  ok: boolean;
  tools?: Array<{ name: string }>;
  durationMs?: number;
  errorKind?: string;
  error?: string;
}

type TestClient = Pick<ApiClient, 'get' | 'post'>;

/**
 * Resolve the connector by slug-or-id, then POST /api/connectors/:id/test.
 * The endpoint is synchronous (200, not 202): it runs `discoverTools`
 * inline and returns either { ok: true, tools, durationMs } on success or
 * { ok: false, errorKind, error } on failure. No command polling.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 12.
 */
export async function runConnectorTest(
  client: TestClient,
  args: TestArgs,
  print: (line: string) => void,
): Promise<void> {
  const detail = await client.get<ConnectorDetail>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  const result = (await client.post(`/api/connectors/${detail.id}/test`, undefined)) as TestResult;
  if (!result.ok) {
    throw new Error(`test failed: ${result.error ?? result.errorKind ?? 'unknown'}`);
  }
  const tools = result.tools ?? [];
  const durationMs = result.durationMs ?? 0;
  print(ok(`passed · ${tools.length} tools · ${durationMs}ms`));
  for (const t of tools) {
    print(`  - ${t.name}`);
  }
}

export default defineCommand({
  meta: { name: 'test', description: 'verify a connector can list its tools' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: false },
    profile: { type: 'string', description: 'profile name', required: false },
  },
  async run({ args }) {
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    const target = await resolveConnector(args.target as string | undefined, {
      listConnectors: () => client.get('/api/connectors'),
    });
    await runConnectorTest(client, { target }, (line) => console.log(line));
  },
});
