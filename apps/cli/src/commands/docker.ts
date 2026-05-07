import { defineCommand } from 'citty';
import { runCompose } from '../lib/compose.js';
import { buildContext, ensureProfileExists } from '../lib/context.js';

export default defineCommand({
  meta: {
    name: 'docker',
    description: 'raw docker compose escape hatch (forwards args verbatim)',
  },
  args: {
    profile: { type: 'string', description: 'override resolved profile' },
  },
  async run({ args, rawArgs }) {
    const ctx = buildContext({ profileFlag: args.profile });
    ensureProfileExists(ctx);
    const passthrough = stripOwnFlags(rawArgs ?? []);
    const code = await runCompose(ctx.home, ctx.profile.name, passthrough);
    process.exit(code);
  },
});

function stripOwnFlags(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === undefined) continue;
    if (arg === '--profile') {
      i++; // skip value
      continue;
    }
    if (arg.startsWith('--profile=')) continue;
    out.push(arg);
  }
  return out;
}
