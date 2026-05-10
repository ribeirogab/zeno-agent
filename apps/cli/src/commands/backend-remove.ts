/**
 * Spec 0072 — `zeno backend remove [slug]` — delete a backend's credentials.
 *
 * Removes all encrypted KV rows for `(profile_id, backend_id)` via
 * `BackendCredentialsRepo.delete`. The materializer's next poll cycle then
 * removes `~/.claude/credentials.json` from inside the container.
 */

import { defineCommand } from 'citty';
import { c, ok, setQuiet } from '../lib/output.js';
import { confirm } from '../lib/prompt.js';
import { resolveProfile } from '../lib/resolvers.js';
import { openProfileRuntimeDb } from '../lib/runtime-db.js';

export default defineCommand({
  meta: { name: 'remove', description: "remove a backend's credentials" },
  args: {
    slug: { type: 'positional', description: 'backend slug', required: false },
    profile: { type: 'string', description: 'profile identifier' },
    yes: { type: 'boolean', description: 'skip confirmation' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const profile = await resolveProfile(args.profile as string | undefined, {
      ignoreSticky: true,
    });
    const slug = (args.slug as string | undefined) ?? 'claude-code';

    if (!args.yes) {
      const okGo = await confirm(
        `remove ${c.bold(slug)} from profile=${c.bold(profile.name)}? this clears credentials. (y/N)`,
      );
      if (!okGo) {
        process.stderr.write('aborted\n');
        process.exit(130);
      }
    }

    const handle = openProfileRuntimeDb({
      profile: profile.name,
      masterKeyHex: profile.masterKey,
    });
    try {
      handle.backendCredentialsRepo.delete(slug);
      console.log(ok(`removed ${slug} from profile=${profile.name}`));
    } finally {
      handle.close();
    }
  },
});
