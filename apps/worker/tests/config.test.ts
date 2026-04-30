import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@/config';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      GH_TOKEN: 'ghp_abc',
      CLAUDE_CODE_OAUTH_TOKEN: 'cct_abc',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads valid config', () => {
    const cfg = loadConfig();
    expect(cfg.github.token).toBe('ghp_abc');
    expect(cfg.claude.oauthToken).toBe('cct_abc');
  });

  // Spec 0058: SLACK_*_TOKEN removed from worker env config entirely. Slack
  // credentials live in the DB connector_secrets table (managed via dashboard
  // install). The resolver queries the DB directly — no env path remains.
  // Spec 0057's optional-SLACK tests are gone with the field.

  it('throws on missing CLAUDE_CODE_OAUTH_TOKEN', () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    expect(() => loadConfig()).toThrow(/CLAUDE_CODE_OAUTH_TOKEN/);
  });

  it('throws on missing GH_TOKEN', () => {
    delete process.env.GH_TOKEN;
    expect(() => loadConfig()).toThrow(/GH_TOKEN/);
  });
});
