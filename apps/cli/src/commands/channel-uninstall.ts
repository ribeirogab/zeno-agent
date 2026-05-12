/**
 * Spec 2026-05-11 — `zeno channel uninstall <slug>` — destructive remove.
 *
 * Wire: `DELETE /api/channels/:slug`. FK CASCADE drops connector_secrets in the
 * same transaction. The worker's ChannelManager picks up the row deletion on the
 * next poll tick (≤2 s) and calls `adapter.stop()` automatically.
 *
 * TTY prompts `uninstall channel '<slug>'? (y/N)`; `--yes` skips. Non-TTY without
 * `--yes` exits 1.
 */

import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';
import { isQuiet, ok, setQuiet } from '../lib/output.js';
import { confirmDestructive } from '../lib/prompt.js';
import { resolveProfile } from '../lib/resolvers.js';

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export default defineCommand({
  meta: { name: 'uninstall', description: 'remove a channel and its encrypted secrets' },
  args: {
    slug: { type: 'positional', description: 'channel slug', required: true },
    profile: { type: 'string', description: 'profile name', required: false },
    yes: { type: 'boolean', description: 'skip confirmation', default: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const slug = args.slug as string;
    const confirmed = await confirmDestructive(
      `uninstall channel '${slug}'? this destroys its encrypted secrets`,
      { yes: !!args.yes },
    );
    if (!confirmed) {
      if (!isQuiet()) console.log('aborted');
      // confirmDestructive prints an error + returns false in non-TTY when --yes is missing.
      // Exit 1 to surface the destructive-without-consent case to scripts.
      if (!isInteractive() && !args.yes) process.exit(1);
      return;
    }
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });
    await client.delete(`/api/channels/${slug}`);
    if (!isQuiet()) console.log(ok(`${slug} · uninstalled`));
  },
});
