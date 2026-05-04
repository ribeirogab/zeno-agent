import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@/config';

const VALID_HEX_KEY = 'a'.repeat(64);

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      GH_TOKEN: 'ghp_abc',
      ZENO_MASTER_KEY: VALID_HEX_KEY,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads valid config', () => {
    const cfg = loadConfig();
    expect(cfg.github.token).toBe('ghp_abc');
    expect(cfg.masterKey).toEqual(Buffer.from(VALID_HEX_KEY, 'hex'));
    expect(cfg.claude.legacyOauthToken).toBeNull();
  });

  it('captures CLAUDE_CODE_OAUTH_TOKEN as legacy import path', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-legacy';
    const cfg = loadConfig();
    expect(cfg.claude.legacyOauthToken).toBe('sk-ant-legacy');
  });

  it('throws on missing ZENO_MASTER_KEY', () => {
    delete process.env.ZENO_MASTER_KEY;
    expect(() => loadConfig()).toThrow(/ZENO_MASTER_KEY/);
  });

  it('throws on malformed ZENO_MASTER_KEY (not 64 hex)', () => {
    process.env.ZENO_MASTER_KEY = 'tooshort';
    expect(() => loadConfig()).toThrow(/ZENO_MASTER_KEY/);
  });

  it('throws on missing GH_TOKEN', () => {
    delete process.env.GH_TOKEN;
    expect(() => loadConfig()).toThrow(/GH_TOKEN/);
  });

  // Spec 0058: SLACK_*_TOKEN removed from worker env config entirely. Slack
  // credentials live in the DB connector_secrets table (managed via dashboard
  // install). The resolver queries the DB directly — no env path remains.
  // Spec 0071: CLAUDE_CODE_OAUTH_TOKEN is no longer required at boot. It
  // remains an OPTIONAL env var that triggers a one-shot legacy import; if
  // absent, the worker boots gracefully and the token is supplied via the DB.
});
