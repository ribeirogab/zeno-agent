import { createLogger } from '@zeno/logger';
import { ConnectorRepo, openDatabase, runMigrations } from '@zeno/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSlackCredentials } from '@/channels/slack/resolve-credentials';

/**
 * Spec 0058: 4-row resolution table (the .env fallback path was removed after
 * profiles/fn cut over to DB-only credentials). Tests use REAL ConnectorRepo
 * against in-memory SQLite — no mocks. This matches the existing repo test
 * pattern and keeps the resolver tests honest (real SQL constraints exercised
 * end-to-end).
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

describe('resolveSlackCredentials — resolution table (spec 0058)', () => {
  it('1. enabled DB row + both secrets → returns creds', () => {
    connectors.create({
      ...SLACK_BASE,
      status: 'enabled',
      secrets: [
        { key: 'SLACK_APP_TOKEN', value: 'xapp-fromdb' },
        { key: 'SLACK_BOT_TOKEN', value: 'xoxb-fromdb' },
      ],
    });
    const result = resolveSlackCredentials({ connectors, logger });
    expect(result.appToken).toBe('xapp-fromdb');
    expect(result.botToken).toBe('xoxb-fromdb');
  });

  it('2. enabled DB row + missing secret → hard error (operator misconfig)', () => {
    connectors.create({
      ...SLACK_BASE,
      status: 'enabled',
      secrets: [{ key: 'SLACK_APP_TOKEN', value: 'xapp-only' }],
      // SLACK_BOT_TOKEN missing
    });
    expect(() => resolveSlackCredentials({ connectors, logger })).toThrow(/credentials missing/);
  });

  it('3. disabled row → hard error (treated identically to "not installed")', () => {
    connectors.create({
      ...SLACK_BASE,
      status: 'disabled',
      secrets: [
        { key: 'SLACK_APP_TOKEN', value: 'xapp-x' },
        { key: 'SLACK_BOT_TOKEN', value: 'xoxb-x' },
      ],
    });
    expect(() => resolveSlackCredentials({ connectors, logger })).toThrow(
      /Slack channel not installed/,
    );
  });

  it('4. no DB row → hard error (Slack channel not installed)', () => {
    expect(() => resolveSlackCredentials({ connectors, logger })).toThrow(
      /Slack channel not installed/,
    );
  });
});
