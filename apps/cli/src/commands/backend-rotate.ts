/**
 * Spec 0072 — `zeno backend rotate <slug>` — re-run the auth flow for an
 * existing backend, overwriting the stored credential. Same flow as
 * `configure`, gated by a (y/N) prompt.
 */

import { defineCommand } from 'citty';
import { confirm } from '../lib/prompt.js';
import { resolveProfile } from '../lib/resolvers.js';
import { c, setQuiet } from '../lib/output.js';
import configureCmd from './backend-configure.js';

export default defineCommand({
  meta: { name: 'rotate', description: 'rotate credentials for an existing backend' },
  args: {
    slug: { type: 'positional', description: 'backend slug', required: false },
    profile: { type: 'string', description: 'profile identifier' },
    yes: { type: 'boolean', description: 'skip confirmation' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const profile = await resolveProfile(args.profile as string | undefined);
    const slug = (args.slug as string | undefined) ?? 'claude-code';

    if (!args.yes) {
      const ok = await confirm(`rotate ${c.bold(slug)} creds for profile=${c.bold(profile.name)}? (y/N)`);
      if (!ok) {
        process.stderr.write('aborted\n');
        process.exit(130);
      }
    }

    // Delegate to configure (overwrites the existing row via upsert). Pass
    // through the profile so configure does not re-resolve.
    return configureCmd.run!({
      args: { profile: profile.name, quiet: args.quiet },
      rawArgs: [],
      cmd: configureCmd,
      data: undefined,
    } as never);
  },
});
