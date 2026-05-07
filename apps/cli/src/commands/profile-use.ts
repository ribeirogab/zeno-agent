import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { c, ok } from '../lib/output.js';
import { requireProfile } from '../lib/profile.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'use',
    description: 'set sticky default profile',
  },
  args: {
    profile: { type: 'positional', description: 'profile identifier', required: true },
  },
  run({ args }) {
    const conn = db();
    const name = args.profile;
    requireProfile(conn, name);
    queries.setSticky(conn, name);
    queries.appendAudit(conn, { action: 'profile.use', target: name });
    console.log(ok(`Sticky profile set to ${c.bold(name)}`));
  },
});
