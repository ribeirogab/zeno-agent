import { defineCommand } from 'citty';
import { runCompose } from '../lib/compose.js';
import { buildContext, ensureProfileExists } from '../lib/context.js';

export default defineCommand({
  meta: { name: 'logs', description: 'follow logs' },
  args: {
    profile: { type: 'string', description: 'override resolved profile' },
    tail: { type: 'string', description: 'lines of recent log to show', default: '50' },
    service: {
      type: 'string',
      description: 'service name from compose file, or "all"',
      default: 'all',
    },
  },
  async run({ args }) {
    const ctx = buildContext({ profileFlag: args.profile });
    ensureProfileExists(ctx);
    const composeArgs = ['logs', '-f', '--tail', String(args.tail)];
    const service = String(args.service);
    if (service && service !== 'all') composeArgs.push(service);
    const code = await runCompose(ctx.home, ctx.profile.name, composeArgs);
    process.exit(code);
  },
});
