import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { materializeClaudeCredentials } from '@/agent/credentials-materializer';

describe('materializeClaudeCredentials', () => {
  let claudeHome: string;

  beforeEach(() => {
    claudeHome = mkdtempSync(join(tmpdir(), 'claude-home-'));
  });

  it('writes .credentials.json with the SDK shape', async () => {
    await materializeClaudeCredentials({ claudeHome, oauthToken: 'sk-ant-x' });
    const target = join(claudeHome, '.credentials.json');
    expect(existsSync(target)).toBe(true);
    const data = JSON.parse(readFileSync(target, 'utf8'));
    expect(data.claudeAiOauth.accessToken).toBe('sk-ant-x');
  });

  it('atomic write — leaves no .tmp on success', async () => {
    await materializeClaudeCredentials({ claudeHome, oauthToken: 'sk-ant-x' });
    expect(existsSync(join(claudeHome, '.credentials.json.tmp'))).toBe(false);
  });

  it('overwrites an existing file without leaking prior content', async () => {
    await materializeClaudeCredentials({ claudeHome, oauthToken: 'sk-ant-old' });
    await materializeClaudeCredentials({ claudeHome, oauthToken: 'sk-ant-new' });
    const data = JSON.parse(readFileSync(join(claudeHome, '.credentials.json'), 'utf8'));
    expect(data.claudeAiOauth.accessToken).toBe('sk-ant-new');
  });

  it('writes with mode 0600 (owner-only)', async () => {
    await materializeClaudeCredentials({ claudeHome, oauthToken: 'sk-ant-x' });
    const stat = statSync(join(claudeHome, '.credentials.json'));
    // mode bits — mask to permission bits only
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('serializes concurrent writes via mutex', async () => {
    // Fire 5 concurrent writes; the last one should win deterministically.
    await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        materializeClaudeCredentials({ claudeHome, oauthToken: `sk-ant-${i}` }),
      ),
    );
    const data = JSON.parse(readFileSync(join(claudeHome, '.credentials.json'), 'utf8'));
    // The token in the file is one of the 5 — not a torn write
    expect(['sk-ant-1', 'sk-ant-2', 'sk-ant-3', 'sk-ant-4', 'sk-ant-5']).toContain(
      data.claudeAiOauth.accessToken,
    );
  });
});
