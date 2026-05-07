import { defineCommand } from 'citty';
import { buildContext } from '../lib/context.js';

export default defineCommand({
  meta: { name: 'show', description: 'print resolved profile + source' },
  args: {
    profile: { type: 'string', description: 'override resolved profile' },
  },
  run({ args }) {
    const ctx = buildContext({ profileFlag: args.profile });
    console.log(`profile: ${ctx.profile.name} (source: ${ctx.profile.source})`);
  },
});
