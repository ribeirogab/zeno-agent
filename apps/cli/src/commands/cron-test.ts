/**
 * Spec 2026-05-22 — `zeno cron test <slug>` — fire the cron once on demand.
 *
 * Enqueues a `cron_test` command via POST /api/crons/:slug/test (returns 202
 * with a correlationId), then polls /api/commands/:correlationId until the
 * worker's dispatcher reports a terminal status. Prints session id + latency.
 */

import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient, ApiError } from '../lib/api-client.js';
import { validateSlug } from '../lib/cron-frontmatter.js';
import { c, err as errStr, ok as okStr, setQuiet } from '../lib/output.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { db } from '../lib/state.js';
import { waitForCommand } from '../lib/wait-command.js';

interface CronTestResult {
  sessionId: string | null;
  status: 'success' | 'failed';
  latencyMs: number;
  error?: string;
}

export default defineCommand({
  meta: { name: 'test', description: 'fire the cron once on demand (returns agent session id)' },
  args: {
    slug: { type: 'positional', description: 'cron slug', required: true },
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit JSON', default: false },
    timeout: {
      type: 'string',
      description: 'wait timeout in ms (default 300000)',
      required: false,
    },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    requireProfile(conn, profile);

    const slug = String(args.slug);
    const slugCheck = validateSlug(slug);
    if (!slugCheck.ok) {
      console.error(errStr(slugCheck.reason));
      process.exit(1);
    }

    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });

    let enqueue: { correlationId: string };
    try {
      enqueue = (await client.post(`/api/crons/${slug}/test`, {})) as { correlationId: string };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        console.error(errStr(`cron not found: ${slug}`));
        process.exit(1);
      }
      console.error(errStr(`test failed to enqueue: ${String(e)}`));
      process.exit(1);
    }

    const timeoutMs = Number(args.timeout ?? '300000') || 300_000;
    let status: Awaited<ReturnType<typeof waitForCommand>>;
    try {
      status = await waitForCommand(client, enqueue.correlationId, { timeoutMs });
    } catch (e) {
      console.error(errStr(String(e)));
      process.exit(1);
    }

    let parsedResult: {
      error?: string;
      sessionId?: string | null;
      status?: string;
      latencyMs?: number;
    } | null = null;
    if (status.result) {
      try {
        parsedResult = JSON.parse(status.result);
      } catch {
        parsedResult = null;
      }
    }

    if (status.status === 'failed') {
      console.error(errStr(`test failed: ${parsedResult?.error ?? 'unknown'}`));
      process.exit(1);
    }

    const result = parsedResult as CronTestResult | null;
    if (!result) {
      console.error(errStr('test returned no data'));
      process.exit(1);
    }

    if (args.json) {
      console.log(JSON.stringify(result));
      return;
    }

    const session = result.sessionId ?? '—';
    if (result.status === 'success') {
      console.log(okStr(`${slug} · passed · session ${c.gray(session)} · ${result.latencyMs} ms`));
    } else {
      console.error(
        errStr(
          `${slug} · failed · session ${c.gray(session)} · ${result.latencyMs} ms${
            result.error ? ` · ${result.error}` : ''
          }`,
        ),
      );
      process.exit(1);
    }
  },
});
