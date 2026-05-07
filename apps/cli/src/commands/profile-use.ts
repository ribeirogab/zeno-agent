import { defineCommand } from 'citty';
import { composeFileExists } from '../lib/compose.js';
import { listProfiles } from '../lib/profile-list.js';
import { readState, writeState } from '../lib/state.js';
import { resolveZenoHome } from '../lib/zeno-home.js';

export default defineCommand({
  meta: {
    name: 'use',
    description: 'select profile (writes apps/cli/.state.json)',
  },
  args: {
    name: {
      type: 'positional',
      required: true,
      description: 'profile name',
    },
  },
  run({ args }) {
    const home = resolveZenoHome();
    const name = String(args.name);
    if (!composeFileExists(home, name)) {
      const available = listProfiles(home);
      console.error(`error: profile '${name}' not found`);
      console.error(
        `       valid profiles: ${available.length > 0 ? available.join(', ') : '(none)'}`,
      );
      process.exit(1);
    }
    const state = readState(home);
    writeState(home, { ...state, profile: name });
    console.log(`profile set to '${name}'`);
  },
});
