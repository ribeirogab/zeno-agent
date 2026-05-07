import { defineCommand } from 'citty';

import { stopContainer } from '../lib/orchestrator.js';
import { c, info } from '../lib/output.js';
import { requireProfile, resolveName } from '../lib/profile.js';
import { spin } from '../lib/spinner.js';
import { load, save } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'stop',
    description: 'stop a profile container (default = sticky)',
  },
  args: {
    name: { type: 'positional', description: 'profile name (omit for sticky)', required: false },
    all: { type: 'boolean', description: 'stop every profile' },
  },
  async run({ args }) {
    const state = load();
    const targets = args.all
      ? Object.keys(state.profiles)
      : [resolveName(state, args.name as string | undefined)];
    if (targets.length === 0) {
      console.log(c.gray('no profiles to stop.'));
      return;
    }
    for (const name of targets) {
      requireProfile(state, name);
      const result = stopContainer(state, name);
      if (result.alreadyStopped) {
        console.log(info(`profile ${c.bold(name)} already stopped`));
        continue;
      }
      await spin(`stopping container ${c.gray(`zeno-${name}`)}`, 800, {
        successText: `Container ${c.gray(`zeno-${name}`)} stopped`,
      });
    }
    save(state);
  },
});
