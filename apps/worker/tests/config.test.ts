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

  // Spec 0057: SLACK_*_TOKEN are now OPTIONAL in the Zod schema. The boot
  // resolver (apps/worker/src/channels/slack/resolve-credentials.ts) decides
  // whether the credentials are required at runtime — DB-first with .env
  // fallback. So loadConfig() succeeds without them; the error surfaces from
  // the resolver if neither DB row nor env var is present.
  it('does NOT throw when SLACK_APP_TOKEN is missing (spec 0057 — optional in schema)', () => {
    delete process.env.SLACK_APP_TOKEN;
    expect(() => loadConfig()).not.toThrow();
  });

  it('config.slack.appToken is undefined when env var missing (spec 0057)', () => {
    delete process.env.SLACK_APP_TOKEN;
    const cfg = loadConfig();
    expect(cfg.slack.appToken).toBeUndefined();
  });

  it('throws on missing CLAUDE_CODE_OAUTH_TOKEN', () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    expect(() => loadConfig()).toThrow(/CLAUDE_CODE_OAUTH_TOKEN/);
  });

  it('throws on malformed SLACK_APP_TOKEN prefix (still validated when present)', () => {
    process.env.SLACK_APP_TOKEN = 'not-a-valid-prefix';
    expect(() => loadConfig()).toThrow(/SLACK_APP_TOKEN/);
  });
});
