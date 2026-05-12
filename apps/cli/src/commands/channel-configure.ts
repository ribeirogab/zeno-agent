/**
 * Spec 2026-05-11 — `zeno channel configure <slug>` — update non-secret config.
 *
 * Wire: `PATCH /api/channels/:slug/secrets` with `mode: 'merge'`. The handler reads
 * the catalog and sets `isPublic` from the matching field; both secret and public
 * fields share storage. Configure only submits public fields the operator passed
 * as typed flags (e.g. `--dm-owner-user-id U123`).
 */

import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';
import { c, err, isQuiet, ok, setQuiet } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';

interface CatalogFieldRemote {
  key: string;
  required: boolean;
  public: boolean;
}

interface CatalogEntryRemote {
  id: string;
  slug: string;
  fields: CatalogFieldRemote[];
}

export default defineCommand({
  meta: {
    name: 'configure',
    description: "update channel's non-secret config (e.g. dm-owner-user-id)",
  },
  args: {
    slug: { type: 'positional', description: 'channel slug', required: true },
    profile: { type: 'string', description: 'profile name', required: false },
    'dm-owner-user-id': {
      type: 'string',
      description: 'restrict DMs to this Slack user id (Uxxx)',
      required: false,
    },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });
    const slug = args.slug as string;

    const detail = await client.get<{ catalogId: string }>(`/api/channels/${slug}`);
    const catalog = await client.get<{ channels: CatalogEntryRemote[] }>('/api/channels/catalog');
    const entry = catalog.channels.find((e) => e.id === detail.catalogId);
    if (!entry) {
      console.error(err(`catalog entry '${detail.catalogId}' not found`));
      process.exit(1);
    }

    // Each public field maps to a kebab-cased CLI flag with the same suffix as the
    // field key (lower-snake → kebab). Today: only `dm_owner_user_id`. Future channels
    // declare more public fields; the citty defineCommand `args` block must learn each
    // one — kept manual rather than dynamic because citty types lock at definition time.
    const flagMap: Record<string, unknown> = {
      dm_owner_user_id: args['dm-owner-user-id'],
    };
    const submitted: Array<{ key: string; value: string }> = [];
    for (const field of entry.fields.filter((f) => f.public)) {
      const value = flagMap[field.key];
      if (typeof value === 'string' && value.length > 0) {
        submitted.push({ key: field.key, value });
      }
    }
    if (submitted.length === 0) {
      console.error(err('no public config fields supplied (pass --dm-owner-user-id <value>)'));
      process.exit(1);
    }

    await client.patch(`/api/channels/${slug}/secrets`, { mode: 'merge', secrets: submitted });
    if (!isQuiet()) {
      const keys = submitted.map((s) => s.key).join(', ');
      console.log(ok(`${slug} · configured · ${c.gray(keys)}`));
    }
  },
});
