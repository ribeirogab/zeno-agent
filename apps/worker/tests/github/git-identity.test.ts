import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGitEnv, parseGitIdentityFromConfig } from '@/github/git-identity';

const TMP = join(tmpdir(), `git-identity-test-${Date.now()}`);
const CONFIG_PATH = join(TMP, 'config.yaml');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  vi.restoreAllMocks();
});

describe('parseGitIdentityFromConfig', () => {
  it('returns identity when git_identity is present in config', () => {
    writeFileSync(
      CONFIG_PATH,
      `
github_app:
  app_id: "123"
  private_key_file: key.pem
  git_identity:
    name: "my-bot[bot]"
    email: "123+my-bot[bot]@users.noreply.github.com"
  installations: []
`,
    );

    const result = parseGitIdentityFromConfig([TMP]);
    expect(result).toEqual({
      name: 'my-bot[bot]',
      email: '123+my-bot[bot]@users.noreply.github.com',
    });
  });

  it('returns null when no git_identity section', () => {
    writeFileSync(
      CONFIG_PATH,
      `
github_app:
  app_id: "123"
  private_key_file: key.pem
  installations: []
`,
    );

    const result = parseGitIdentityFromConfig([TMP]);
    expect(result).toBeNull();
  });

  it('returns null when no config file exists', () => {
    const result = parseGitIdentityFromConfig(['/nonexistent/path']);
    expect(result).toBeNull();
  });

  it('returns null when git_identity has missing fields', () => {
    writeFileSync(
      CONFIG_PATH,
      `
github_app:
  git_identity:
    name: "bot"
`,
    );

    const result = parseGitIdentityFromConfig([TMP]);
    expect(result).toBeNull();
  });
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
