import { createLogger } from '@zeno/logger';
import { ConnectorRepo, openDatabase, runMigrations } from '@zeno/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSlackCredentials } from '@/channels/slack/resolve-credentials';

/**
 * Spec 0057: covers the 6-row resolution table in resolve-credentials.ts.
 * Tests use REAL ConnectorRepo against in-memory SQLite — no mocks. This
 * matches the existing repo test pattern and keeps the resolver tests honest
 * (real SQL constraints exercised end-to-end).
 */

const logger = createLogger({ service: 'test' });

let db: ReturnType<typeof openDatabase>;
let connectors: ConnectorRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  connectors = new ConnectorRepo(db);
});

afterEach(() => {
  db.close();
});

const SLACK_BASE = {
  slug: 'slack',
  displayName: 'Slack',
  source: 'catalog' as const,
  catalogId: 'slack',
  transport: 'remote' as const,
  command: null,
  args: null,
  url: null,
  kind: 'channel' as const,
  tools: [],
};

describe('resolveSlackCredentials — resolution table (spec 0057)', () => {
  it('1. enabled DB row + both secrets → DB creds, source=connector_secrets', () => {
    connectors.create({
      ...SLACK_BASE,
      status: 'enabled',
      secrets: [
        { key: 'SLACK_APP_TOKEN', value: 'xapp-fromdb' },
        { key: 'SLACK_BOT_TOKEN', value: 'xoxb-fromdb' },
      ],
    });
    const result = resolveSlackCredentials({
      connectors,
      env: { appToken: undefined, botToken: undefined },
      logger,
    });
    expect(result.appToken).toBe('xapp-fromdb');
    expect(result.botToken).toBe('xoxb-fromdb');
    expect(result.source).toBe('connector_secrets');
  });

  it('2. enabled DB row + missing secret → hard error (does NOT silently fall back to env)', () => {
    connectors.create({
      ...SLACK_BASE,
      status: 'enabled',
      secrets: [{ key: 'SLACK_APP_TOKEN', value: 'xapp-only' }],
      // SLACK_BOT_TOKEN missing
    });
    expect(() =>
      resolveSlackCredentials({
        connectors,
        env: { appToken: 'xapp-fallback', botToken: 'xoxb-fallback' },
        logger,
      }),
    ).toThrow(/credentials missing/);
  });

  it('3. disabled row + both env tokens → env fallback (disabled treated as not-installed)', () => {
    connectors.create({
      ...SLACK_BASE,
      status: 'disabled',
      secrets: [],
    });
    const result = resolveSlackCredentials({
      connectors,
      env: { appToken: 'xapp-env', botToken: 'xoxb-env' },
      logger,
    });
    expect(result.source).toBe('env_fallback');
    expect(result.appToken).toBe('xapp-env');
    expect(result.botToken).toBe('xoxb-env');
  });

  it('4. disabled row + missing env → hard error (no fallback available)', () => {
    connectors.create({
      ...SLACK_BASE,
      status: 'disabled',
      secrets: [],
    });
    expect(() =>
      resolveSlackCredentials({
        connectors,
        env: { appToken: undefined, botToken: undefined },
        logger,
      }),
    ).toThrow(/Slack credentials not configured/);
  });

  it('5. no DB row + both env tokens → env fallback', () => {
    const result = resolveSlackCredentials({
      connectors,
      env: { appToken: 'xapp-env', botToken: 'xoxb-env' },
      logger,
    });
    expect(result.source).toBe('env_fallback');
    expect(result.appToken).toBe('xapp-env');
    expect(result.botToken).toBe('xoxb-env');
  });

  it('6. no DB row + missing env → hard error', () => {
    expect(() =>
      resolveSlackCredentials({
        connectors,
        env: { appToken: undefined, botToken: undefined },
        logger,
      }),
    ).toThrow(/Slack credentials not configured/);
  });
});
