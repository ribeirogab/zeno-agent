import { defineCommand } from 'citty';

import { c, ok } from '../lib/output.js';
import { requireProfile } from '../lib/profile.js';
import { audit, load, save } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'use',
    description: 'set sticky default profile',
  },
  args: {
    name: { type: 'positional', description: 'profile name', required: true },
  },
  run({ args }) {
    const state = load();
    const name = args.name;
    requireProfile(state, name);
    state.currentProfile = name;
    audit(state, 'profile.use', name, {});
    save(state);
    console.log(ok(`Sticky profile set to ${c.bold(name)}`));
  },
});
