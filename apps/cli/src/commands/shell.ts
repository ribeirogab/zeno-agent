import { defineCommand } from 'citty';
import { runCompose } from '../lib/compose.js';
import { buildContext, ensureProfileExists } from '../lib/context.js';

export default defineCommand({
  meta: { name: 'shell', description: 'bash inside agent container' },
  args: {
    profile: { type: 'string', description: 'override resolved profile' },
  },
  async run({ args }) {
    const ctx = buildContext({ profileFlag: args.profile });
    ensureProfileExists(ctx);
    const code = await runCompose(ctx.home, ctx.profile.name, ['exec', 'agent', 'bash']);
    process.exit(code);
  },
});
