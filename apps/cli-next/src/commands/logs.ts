import { defineCommand } from 'citty';

import { c, err, mock } from '../lib/output.js';
import { requireProfile, resolveName } from '../lib/profile.js';
import { load } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'logs',
    description: 'tail container logs',
  },
  args: {
    name: { type: 'positional', description: 'profile name (omit for sticky)', required: false },
    tail: { type: 'string', description: 'last N lines (default 50)' },
  },
  run({ args }) {
    const state = load();
    const name = resolveName(state, args.name as string | undefined);
    const p = requireProfile(state, name);
    if (p.status !== 'running') {
      console.error(err(`profile ${c.bold(name)} is not running.`));
      process.exit(1);
    }
    const tail = args.tail ? Number(args.tail) : 50;
    console.log(mock(`would exec: ${c.bold(`docker logs -f --tail ${tail} zeno-${name}`)}`));
    console.log(c.gray('  (would stream until ^C)'));
  },
});
