/**
 * Spec 2026-05-11 — `zeno channel test <slug>` — synchronous probe via catalog strategy.
 *
 * Wire: `POST /api/channels/:slug/test`. Returns `{ status, latencyMs, error? }`. CLI
 * prints `passed · Xms` (exit 0) or `failed · <error>` (exit 1).
 */

import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';
import { err, isQuiet, ok, setQuiet } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';

interface ChannelTestJson {
  status: 'passed' | 'failed';
  latencyMs: number;
  error?: string;
}

export default defineCommand({
  meta: { name: 'test', description: 'probe channel connectivity via catalog test strategy' },
  args: {
    slug: { type: 'positional', description: 'channel slug', required: true },
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit JSON', default: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });
    const slug = args.slug as string;

    const result = (await client.post(`/api/channels/${slug}/test`, {})) as ChannelTestJson;
    if (args.json) {
      console.log(JSON.stringify(result));
    } else if (result.status === 'passed') {
      if (!isQuiet()) console.log(ok(`passed · ${result.latencyMs}ms`));
    } else {
      console.error(err(`failed · ${result.error ?? 'unknown'}`));
    }
    if (result.status !== 'passed') process.exit(1);
  },
});
