import { defineCommand } from 'citty';
import { runCompose } from '../lib/compose.js';
import { buildContext, ensureProfileExists } from '../lib/context.js';

export default defineCommand({
  meta: { name: 'restart', description: 'stop + start' },
  args: {
    profile: { type: 'string', description: 'override resolved profile' },
  },
  async run({ args }) {
    const ctx = buildContext({ profileFlag: args.profile });
    ensureProfileExists(ctx);
    const stopCode = await runCompose(ctx.home, ctx.profile.name, ['down']);
    if (stopCode !== 0) process.exit(stopCode);
    const startCode = await runCompose(ctx.home, ctx.profile.name, ['up', '-d']);
    process.exit(startCode);
  },
});
