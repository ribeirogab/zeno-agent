import type { CliState } from './state.js';

export type ProfileSource = 'flag' | 'env' | 'state' | 'default';

export interface ResolvedProfile {
  name: string;
  source: ProfileSource;
}

export interface ResolveProfileInput {
  flag?: string | undefined;
  env?: string | undefined;
  state: CliState;
}

export function resolveProfile(input: ResolveProfileInput): ResolvedProfile {
  if (input.flag) return { name: input.flag, source: 'flag' };
  if (input.env) return { name: input.env, source: 'env' };
  if (input.state.profile) return { name: input.state.profile, source: 'state' };
  return { name: 'default', source: 'default' };
}
