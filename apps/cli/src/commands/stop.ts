import { defineCommand } from 'citty';
import { runCompose } from '../lib/compose.js';
import { buildContext, ensureProfileExists } from '../lib/context.js';

export default defineCommand({
  meta: { name: 'stop', description: 'stop agent (compose down)' },
  args: {
    profile: { type: 'string', description: 'override resolved profile' },
  },
  async run({ args }) {
    const ctx = buildContext({ profileFlag: args.profile });
    ensureProfileExists(ctx);
    const code = await runCompose(ctx.home, ctx.profile.name, ['down']);
    process.exit(code);
  },
});
