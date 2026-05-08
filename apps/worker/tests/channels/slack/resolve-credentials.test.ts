import { ConnectorRepo, openRuntimeDatabase, runRuntimeMigrations } from '@zeno/db/runtime';
import { createLogger } from '@zeno/logger';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSlackCredentials } from '@/channels/slack/resolve-credentials';

/**
 * Resolves Slack credentials from the connector RuntimeDB. The .env fallback path is
 * gone (RuntimeDB-only since spec 0058). After multi-profile-cli, missing/incomplete
 * Slack returns null instead of throwing — the worker boots with a NoopChannel
 * so the dashboard at apps/api stays reachable for the operator to install
 * Slack via /connectors. Tests use REAL ConnectorRepo against in-memory SQLite.
 */

const logger = createLogger({ service: 'test' });

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: ReturnType<typeof openRuntimeDatabase>['drizzle'];
let connectors: ConnectorRepo;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
  connectors = new ConnectorRepo(db, {
    masterKey: Buffer.from('a'.repeat(64), 'hex'),
    profileId: 'test',
  });
});

afterEach(() => {
  opened.close();
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

describe('resolveSlackCredentials — resolution table', () => {
  it('1. enabled RuntimeDB row + both secrets → returns creds', () => {
    connectors.create({
      ...SLACK_BASE,
      status: 'enabled',
      secrets: [
        { key: 'SLACK_APP_TOKEN', value: 'xapp-fromdb' },
        { key: 'SLACK_BOT_TOKEN', value: 'xoxb-fromdb' },
      ],
    });
    const result = resolveSlackCredentials({ connectors, logger });
    expect(result).not.toBeNull();
    expect(result?.appToken).toBe('xapp-fromdb');
    expect(result?.botToken).toBe('xoxb-fromdb');
  });

  it('2. enabled RuntimeDB row + missing secret → returns null (worker boots with NoopChannel)', () => {
    connectors.create({
      ...SLACK_BASE,
      status: 'enabled',
      secrets: [{ key: 'SLACK_APP_TOKEN', value: 'xapp-only' }],
      // SLACK_BOT_TOKEN missing
    });
    expect(resolveSlackCredentials({ connectors, logger })).toBeNull();
  });

  it('3. disabled row → returns null (treated identically to "not installed")', () => {
    connectors.create({
      ...SLACK_BASE,
      status: 'disabled',
      secrets: [
        { key: 'SLACK_APP_TOKEN', value: 'xapp-x' },
        { key: 'SLACK_BOT_TOKEN', value: 'xoxb-x' },
      ],
    });
    expect(resolveSlackCredentials({ connectors, logger })).toBeNull();
  });

  it('4. no RuntimeDB row → returns null (Slack channel not installed)', () => {
    expect(resolveSlackCredentials({ connectors, logger })).toBeNull();
  });
});
