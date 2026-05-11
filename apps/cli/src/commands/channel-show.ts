/**
 * Spec 2026-05-11 — `zeno channel show <slug>` — full detail for one channel.
 *
 * Reads `GET /api/channels/:slug`. Public fields (catalog `public: true`) render
 * unmasked; non-public secrets render with a `last4` hint.
 */

import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';
import { c, isQuiet, setQuiet } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';

interface ChannelSecretMasked {
  key: string;
  isPublic: false;
  masked: true;
  last4: string;
}

interface ChannelSecretPublic {
  key: string;
  isPublic: true;
  masked: false;
  value: string;
}

type ChannelSecret = ChannelSecretMasked | ChannelSecretPublic;

export interface ChannelShowJson {
  id: string;
  slug: string;
  catalogId: string;
  displayName: string;
  status: string;
  lastError: string | null;
  lastErrorAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  iconUrl: string | null;
  secrets: ChannelSecret[];
}

export default defineCommand({
  meta: { name: 'show', description: 'show channel detail (secrets masked except public fields)' },
  args: {
    slug: { type: 'positional', description: 'channel slug or id', required: false },
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit JSON', default: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });

    let slug = args.slug as string | undefined;
    if (!slug) {
      const rows = await client.get<Array<{ slug: string }>>('/api/channels');
      if (rows.length === 0) {
        console.error('no channels installed');
        process.exit(1);
      }
      if (rows.length === 1) {
        slug = rows[0]!.slug;
      } else {
        console.error('usage: zeno channel show <slug>');
        process.exit(1);
      }
    }
    const detail = await client.get<ChannelShowJson>(`/api/channels/${slug}`);
    if (args.json) {
      console.log(JSON.stringify(detail));
      return;
    }
    if (!isQuiet()) {
      console.log('');
      console.log(`  ${c.bold(detail.slug)}  ${detail.displayName}`);
      console.log(`  status:     ${detail.status}`);
      console.log(`  catalog:    ${detail.catalogId}`);
      if (detail.lastError) {
        console.log(`  ${c.red('error')}:      ${detail.lastError}`);
      }
      if (detail.lastVerifiedAt) console.log(`  last test:  ${detail.lastVerifiedAt}`);
      console.log('');
      console.log(`  ${c.bold('fields')}`);
      for (const s of detail.secrets) {
        if (s.isPublic) {
          console.log(`    ${s.key.padEnd(22)} ${s.value}`);
        } else {
          console.log(`    ${s.key.padEnd(22)} ${c.gray('…' + s.last4)}`);
        }
      }
      console.log('');
    }
  },
});
