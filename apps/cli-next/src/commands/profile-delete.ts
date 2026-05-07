import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { defineCommand } from 'citty';

import { c, ok, warn } from '../lib/output.js';
import { requireProfile } from '../lib/profile.js';
import { audit, load, save } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'delete',
    description: 'permanently delete a profile (confirms)',
  },
  args: {
    name: { type: 'positional', description: 'profile name', required: true },
  },
  async run({ args }) {
    const state = load();
    const name = args.name;
    requireProfile(state, name);
    console.log('');
    console.log(warn(`This will permanently delete profile ${c.bold(name)}:`));
    console.log(`  - Container:   ${c.gray(`zeno-${name}`)}`);
    console.log(`  - Volume:      ${c.gray(`zeno-workspace-${name}`)}`);
    console.log(`  - Volume:      ${c.gray(`zeno-claude-home-${name}`)}`);
    console.log(`  - Directory:   ${c.gray(`~/.zeno/profiles/${name}/`)}`);
    console.log(`  - DB row`);
    console.log('');

    const rl = createInterface({ input, output });
    const answer = await rl.question(`Type ${c.bold(`'${name}'`)} to confirm: `);
    rl.close();

    if (answer.trim() !== name) {
      console.log(c.gray('aborted.'));
      process.exit(1);
    }

    delete state.profiles[name];
    if (state.currentProfile === name) state.currentProfile = null;
    audit(state, 'profile.delete', name, {});
    save(state);

    console.log(ok(`Profile ${c.bold(name)} deleted`));
  },
});
