import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGitEnv } from '@/github/git-identity';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildGitEnv', () => {
  it('spreads process.env and overlays GIT_AUTHOR/COMMITTER vars', () => {
    const identity = { name: 'bot', email: 'bot@test.com' };
    const env = buildGitEnv(identity);

    expect(env.GIT_AUTHOR_NAME).toBe('bot');
    expect(env.GIT_COMMITTER_NAME).toBe('bot');
    expect(env.GIT_AUTHOR_EMAIL).toBe('bot@test.com');
    expect(env.GIT_COMMITTER_EMAIL).toBe('bot@test.com');
    expect(env.PATH).toBe(process.env.PATH);
  });
});
