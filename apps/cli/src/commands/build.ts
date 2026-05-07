import { defineCommand } from 'citty';
import { runCompose } from '../lib/compose.js';
import { buildContext, ensureProfileExists } from '../lib/context.js';

export default defineCommand({
  meta: { name: 'build', description: 'build container image' },
  args: {
    profile: { type: 'string', description: 'override resolved profile' },
    'no-cache': { type: 'boolean', description: 'rebuild without cache' },
  },
  async run({ args }) {
    const ctx = buildContext({ profileFlag: args.profile });
    ensureProfileExists(ctx);
    const composeArgs = ['build'];
    if (args['no-cache']) composeArgs.push('--no-cache');
    const code = await runCompose(ctx.home, ctx.profile.name, composeArgs);
    process.exit(code);
  },
});
