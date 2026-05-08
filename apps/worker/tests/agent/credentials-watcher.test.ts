import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BackendCredentialsRepo,
  openRuntimeDatabase,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CredentialsWatcher } from '@/agent/credentials-watcher';

const MASTER_KEY = Buffer.from('a'.repeat(64), 'hex');

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('CredentialsWatcher', () => {
  let claudeHome: string;
  let watcher: CredentialsWatcher;
  let repo: BackendCredentialsRepo;

  beforeEach(() => {
    claudeHome = mkdtempSync(join(tmpdir(), 'claude-home-'));
    const opened = openRuntimeDatabase(':memory:');
    runRuntimeMigrations(opened.raw);
    repo = new BackendCredentialsRepo(opened.drizzle, {
      masterKey: MASTER_KEY,
      profileId: 'default',
    });
  });

  afterEach(() => {
    watcher?.stop();
  });

  it('materializes the credentials file when the RuntimeDB row updates', async () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-1' });
    watcher = new CredentialsWatcher({
      repo,
      claudeHome,
      backendId: 'claude-code',
      intervalMs: 25,
    });
    watcher.start();
    // Trigger a change after start
    await wait(40);
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-2' });
    await wait(80);
    const data = JSON.parse(readFileSync(join(claudeHome, '.credentials.json'), 'utf8'));
    expect(data.claudeAiOauth.accessToken).toBe('sk-ant-2');
  });

  it('does not materialize when nothing changed', async () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-1' });
    watcher = new CredentialsWatcher({
      repo,
      claudeHome,
      backendId: 'claude-code',
      intervalMs: 25,
    });
    watcher.start();
    await wait(80);
    // No upserts since start; file should not exist (watcher was seeded on
    // construction so the unchanged tick doesn't fire materialize).
    expect(existsSync(join(claudeHome, '.credentials.json'))).toBe(false);
  });
});
