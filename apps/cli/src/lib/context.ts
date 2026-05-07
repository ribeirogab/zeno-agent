import { composeFileExists } from './compose.js';
import { type ResolvedProfile, resolveProfile } from './profile.js';
import { readState } from './state.js';
import { resolveZenoHome } from './zeno-home.js';

export interface CliContext {
  home: string;
  profile: ResolvedProfile;
}

export function buildContext(opts: { profileFlag?: string | undefined }): CliContext {
  const home = resolveZenoHome();
  const state = readState(home);
  const profile = resolveProfile({
    flag: opts.profileFlag,
    env: process.env.ZENO_PROFILE,
    state,
  });
  return { home, profile };
}

export function ensureProfileExists(ctx: CliContext): void {
  if (!composeFileExists(ctx.home, ctx.profile.name)) {
    const file = `infra/docker-compose.${ctx.profile.name}.yml`;
    console.error(`error: profile '${ctx.profile.name}' not found`);
    console.error(`       expected: ${file}`);
    console.error('       run: zeno profile list');
    process.exit(1);
  }
}
