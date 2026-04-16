import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@/config';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      SLACK_APP_TOKEN: 'xapp-1-abc',
      SLACK_BOT_TOKEN: 'xoxb-abc',
      GH_TOKEN: 'ghp_abc',
      CLAUDE_CODE_OAUTH_TOKEN: 'cct_abc',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads valid config', () => {
    const cfg = loadConfig();
    expect(cfg.slack.appToken).toBe('xapp-1-abc');
    expect(cfg.slack.botToken).toBe('xoxb-abc');
    expect(cfg.github.token).toBe('ghp_abc');
    expect(cfg.claude.oauthToken).toBe('cct_abc');
  });

  it('throws with clear message on missing SLACK_APP_TOKEN', () => {
    delete process.env.SLACK_APP_TOKEN;
    expect(() => loadConfig()).toThrow(/SLACK_APP_TOKEN/);
  });

  it('throws on missing CLAUDE_CODE_OAUTH_TOKEN', () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    expect(() => loadConfig()).toThrow(/CLAUDE_CODE_OAUTH_TOKEN/);
  });

  it('throws on malformed SLACK_APP_TOKEN prefix', () => {
    process.env.SLACK_APP_TOKEN = 'not-a-valid-prefix';
    expect(() => loadConfig()).toThrow(/SLACK_APP_TOKEN/);
  });
});
