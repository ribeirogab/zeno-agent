import { describe, expect, it } from 'vitest';
import { resolveProfile } from '../profile.js';

describe('resolveProfile', () => {
  it('flag wins over env, state, default', () => {
    expect(
      resolveProfile({
        flag: 'flag-x',
        env: 'env-y',
        state: { profile: 'state-z' },
      }),
    ).toEqual({ name: 'flag-x', source: 'flag' });
  });

  it('env wins over state, default when no flag', () => {
    expect(
      resolveProfile({
        flag: undefined,
        env: 'env-y',
        state: { profile: 'state-z' },
      }),
    ).toEqual({ name: 'env-y', source: 'env' });
  });

  it('state wins over default when no flag/env', () => {
    expect(
      resolveProfile({
        flag: undefined,
        env: undefined,
        state: { profile: 'state-z' },
      }),
    ).toEqual({ name: 'state-z', source: 'state' });
  });

  it('default when nothing set', () => {
    expect(
      resolveProfile({
        flag: undefined,
        env: undefined,
        state: {},
      }),
    ).toEqual({ name: 'default', source: 'default' });
  });

  it('empty string flag is treated as unset', () => {
    expect(
      resolveProfile({
        flag: '',
        env: 'env-y',
        state: {},
      }),
    ).toEqual({ name: 'env-y', source: 'env' });
  });
});
