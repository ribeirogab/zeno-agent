import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { c, err, ok, setQuiet } from '../lib/output.js';
import { pick } from '../lib/picker.js';
import { requireProfile } from '../lib/profile.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'use',
    description: 'set sticky default profile (--clear to unset)',
  },
  args: {
    name: { type: 'positional', description: 'profile identifier', required: false },
    clear: { type: 'boolean', description: 'unset the sticky profile (mutex with positional)' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const name = args.name as string | undefined;
    if (args.clear) {
      if (name) {
        process.stderr.write(`${err('--clear is mutually exclusive with a profile name')}\n`);
        process.exit(1);
      }
      queries.setSticky(conn, null);
      queries.appendAudit(conn, { action: 'profile.use', target: null });
      console.log(ok('sticky cleared'));
      return;
    }
    let target = name;
    if (!target) {
      if (!process.stdin.isTTY) {
        process.stderr.write(`${err('usage: zeno profile use <name>')}\n`);
        process.exit(1);
      }
      const profiles = queries.listProfiles(conn);
      if (profiles.length === 0) {
        process.stderr.write(`${err('no profiles. create one: zeno profile create <name>')}\n`);
        process.exit(1);
      }
      const sticky = queries.getSticky(conn);
      const items = profiles.map((p) => ({
        label: p.name,
        hint: sticky === p.name ? 'current *' : '',
      }));
      const idx = await pick(items, { title: `${c.bold('select sticky profile')}` });
      if (idx === null) {
        process.stderr.write(`${err('aborted')}\n`);
        process.exit(1);
      }
      const chosen = profiles[idx];
      if (!chosen) {
        process.stderr.write(`${err('invalid selection')}\n`);
        process.exit(1);
      }
      target = chosen.name;
    }
    requireProfile(conn, target);
    queries.setSticky(conn, target);
    queries.appendAudit(conn, { action: 'profile.use', target });
    console.log(ok(`Sticky profile set to ${c.bold(target)}`));
  },
});
