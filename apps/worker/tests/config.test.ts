import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@/config';

const VALID_HEX_KEY = 'a'.repeat(64);

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ZENO_MASTER_KEY: VALID_HEX_KEY,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads valid config', () => {
    const cfg = loadConfig();
    expect(cfg.masterKey).toEqual(Buffer.from(VALID_HEX_KEY, 'hex'));
    expect(cfg.logLevel).toBe('info');
    expect(cfg.workspaceDir).toBe('/workspace');
    expect(cfg.logsRetentionDays).toBe(7);
  });

  it('throws on missing ZENO_MASTER_KEY', () => {
    delete process.env.ZENO_MASTER_KEY;
    expect(() => loadConfig()).toThrow(/ZENO_MASTER_KEY/);
  });

  it('throws on malformed ZENO_MASTER_KEY (not 64 hex)', () => {
    process.env.ZENO_MASTER_KEY = 'tooshort';
    expect(() => loadConfig()).toThrow(/ZENO_MASTER_KEY/);
  });

  it('honors LOG_LEVEL override', () => {
    process.env.LOG_LEVEL = 'debug';
    expect(loadConfig().logLevel).toBe('debug');
  });

  it('honors WORKSPACE_DIR override', () => {
    process.env.WORKSPACE_DIR = '/custom/workspace';
    expect(loadConfig().workspaceDir).toBe('/custom/workspace');
  });

  // Spec 0058: SLACK_*_TOKEN removed from worker env config entirely. Slack
  // credentials live in the DB connector_secrets table (managed via dashboard
  // install). The resolver queries the DB directly — no env path remains.
  // Spec 0071: CLAUDE_CODE_OAUTH_TOKEN removed entirely. The dashboard
  // onboarding flow collects it; the worker reads it from the DB via the
  // CredentialsService at every turn.
  // Spec 0044: GH_TOKEN removed entirely. GitHub access is per-installation
  // via the GitHub App connector — `app-auth.ts` mints installation tokens
  // and `mcp__github-app-*` MCP tools consume them.
});
