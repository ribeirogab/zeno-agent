/**
 * Spec 2026-05-11 — `zeno channel rotate <slug>` — replace every required non-public field.
 *
 * Walks every catalog field with `required: true, public: false`, prompts each via
 * `promptHidden`, submits a single atomic `PATCH /api/channels/:slug/secrets` with
 * `mode: 'merge'`. Immediately follows with a `POST /:slug/test` so the operator
 * sees the result inside the same command.
 *
 * Non-TTY without every required field as `--secret KEY=VALUE`: exits 1 — rotate
 * is a hot-path operation and the operator must opt-in explicitly in scripts.
 */

import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';
import { c, err, isQuiet, ok, setQuiet } from '../lib/output.js';
import { promptHidden } from '../lib/prompt.js';
import { resolveProfile } from '../lib/resolvers.js';

interface CatalogFieldRemote {
  key: string;
  label: string;
  help?: string;
  required: boolean;
  public: boolean;
}

interface CatalogEntryRemote {
  id: string;
  slug: string;
  fields: CatalogFieldRemote[];
}

interface ChannelTestJson {
  status: 'passed' | 'failed';
  latencyMs: number;
  error?: string;
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function parseSecretFlags(raw: string | string[] | undefined): Map<string, string> {
  const flags = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const m = new Map<string, string>();
  for (const pair of flags) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    m.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  return m;
}

export default defineCommand({
  meta: { name: 'rotate', description: 'rotate every required secret for a channel and re-test' },
  args: {
    slug: { type: 'positional', description: 'channel slug', required: true },
    profile: { type: 'string', description: 'profile name', required: false },
    secret: { type: 'string', description: 'KEY=VALUE — can repeat for non-interactive', required: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });
    const slug = args.slug as string;

    const detail = await client.get<{ catalogId: string }>(`/api/channels/${slug}`);
    const catalog = await client.get<{ channels: CatalogEntryRemote[] }>(
      '/api/channels/catalog',
    );
    const entry = catalog.channels.find((e) => e.id === detail.catalogId);
    if (!entry) {
      console.error(err(`catalog entry '${detail.catalogId}' not found`));
      process.exit(1);
    }

    const provided = parseSecretFlags(args.secret as string | string[] | undefined);
    const submitted: Array<{ key: string; value: string }> = [];
    for (const field of entry.fields.filter((f) => f.required && !f.public)) {
      const direct = provided.get(field.key);
      if (direct !== undefined) {
        submitted.push({ key: field.key, value: direct });
        continue;
      }
      if (!isInteractive()) {
        console.error(err(`missing required secret: ${field.key} (use --secret ${field.key}=…)`));
        process.exit(1);
      }
      const value = await promptHidden(`${field.label} (${field.key})`, field.help);
      submitted.push({ key: field.key, value });
    }

    await client.patch(`/api/channels/${slug}/secrets`, { mode: 'merge', secrets: submitted });

    // Probe immediately — spec contract: operator sees test result inside the same command,
    // so they don't wait for the 2 s ChannelManager poll to surface a status change.
    const test = (await client.post(`/api/channels/${slug}/test`, {})) as ChannelTestJson;
    if (test.status === 'passed') {
      if (!isQuiet()) console.log(ok(`${slug} · rotated · passed · ${test.latencyMs}ms`));
    } else {
      console.error(err(`${slug} · rotated · test failed · ${c.red(test.error ?? 'unknown')}`));
      process.exit(1);
    }
  },
});
