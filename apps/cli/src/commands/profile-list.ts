import { defineCommand } from 'citty';
import { buildContext } from '../lib/context.js';
import { listProfiles } from '../lib/profile-list.js';

export default defineCommand({
  meta: { name: 'list', description: 'enumerate available profiles' },
  args: {
    profile: { type: 'string', description: 'override resolved profile' },
  },
  run({ args }) {
    const ctx = buildContext({ profileFlag: args.profile });
    const names = listProfiles(ctx.home);
    if (names.length === 0) {
      console.log('(no profiles found in infra/)');
      return;
    }
    for (const n of names) {
      console.log(`${n === ctx.profile.name ? '*' : ' '} ${n}`);
    }
  },
});
