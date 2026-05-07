import { defineCommand } from 'citty';

import { c, mock } from '../lib/output.js';
import { requireProfile, resolveName } from '../lib/profile.js';
import { load } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'open',
    description: 'open the profile dashboard in your browser',
  },
  args: {
    name: { type: 'positional', description: 'profile name (omit for sticky)', required: false },
  },
  run({ args }) {
    const state = load();
    const name = resolveName(state, args.name as string | undefined);
    const p = requireProfile(state, name);
    const url = `http://localhost:${p.port}`;
    console.log(mock(`would open in browser: ${c.cyan(url)}`));
  },
});
