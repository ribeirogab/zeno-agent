/**
 * Spec 0058 integration test: end-to-end resolver + adapter wiring at worker
 * boot, exercising the `_appOverride` test escape hatch on SlackChannel.
 *
 * Chain under test:
 *   resolveSlackCredentials({ connectors, logger })
 *     ↓
 *   new SlackChannel({ appToken, botToken, _appOverride: <mocked App> })
 *     ↓
 *   slack.start(messageHandler)
 *     ↓
 *   verify Bolt App was started with the resolved tokens
 *
 * The resolver is unit-tested against the resolution table separately;
 * SlackChannel dispatch logic is tested in normalize.test.ts. THIS test
 * verifies the wire-up between them: the resolver's output flows into the
 * adapter's constructor, and `_appOverride` actually takes effect (no real
 * socket-mode connection opens).
 *
 * Spec 0058 simplified the resolver — the env_fallback path was removed.
 * Only the RuntimeDB-credentials wire-up remains testable here.
 */

import { ConnectorRepo, openRuntimeDatabase, runRuntimeMigrations } from '@zeno/db/runtime';
import { createLogger } from '@zeno/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlackChannel } from '@/channels/slack/adapter';
import { resolveSlackCredentials } from '@/channels/slack/resolve-credentials';

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

/** Minimal stub of `@slack/bolt`'s App that satisfies SlackChannel's `start()`. */
function makeMockApp(opts: { botUserId?: string } = {}): {
  app: unknown;
  authTestSpy: ReturnType<typeof vi.fn>;
  startSpy: ReturnType<typeof vi.fn>;
  events: Record<string, (handler: unknown) => void>;
} {
  const handlers: Record<string, unknown> = {};
  const authTestSpy = vi.fn().mockResolvedValue({ user_id: opts.botUserId ?? 'UBOT' });
  const startSpy = vi.fn().mockResolvedValue(undefined);
  return {
    app: {
      client: { auth: { test: authTestSpy } },
      event: vi.fn((name: string, handler: unknown) => {
        handlers[name] = handler;
      }),
      message: vi.fn((handler: unknown) => {
        handlers.message = handler;
      }),
      start: startSpy,
      stop: vi.fn().mockResolvedValue(undefined),
    },
    authTestSpy,
    startSpy,
    events: handlers as Record<string, (handler: unknown) => void>,
  };
}

describe('SlackChannel + resolver wire-up (spec 0058)', () => {
  it('resolver tokens flow into SlackChannel via _appOverride; start() dispatches auth test', async () => {
    // Seed an installed Slack channel with both secrets — resolver picks this
    // up from RuntimeDB.
    connectors.create({
      slug: 'slack',
      displayName: 'Slack',
      source: 'catalog',
      catalogId: 'slack',
      transport: 'remote',
      command: null,
      args: null,
      url: null,
      kind: 'channel',
      status: 'enabled',
      secrets: [
        { key: 'SLACK_APP_TOKEN', value: 'xapp-resolver-test' },
        { key: 'SLACK_BOT_TOKEN', value: 'xoxb-resolver-test' },
      ],
      tools: [],
    });

    // 1. Resolver returns the RuntimeDB-stored tokens.
    const creds = resolveSlackCredentials({ connectors, logger });
    expect(creds.appToken).toBe('xapp-resolver-test');
    expect(creds.botToken).toBe('xoxb-resolver-test');

    // 2. Build SlackChannel with resolver tokens + injected mock App.
    //    Without _appOverride, the constructor would open a real socket-mode
    //    connection — that's exactly what the override is meant to prevent.
    const mock = makeMockApp({ botUserId: 'UBOT' });
    const slack = new SlackChannel({
      appToken: creds.appToken,
      botToken: creds.botToken,
      // biome-ignore lint/suspicious/noExplicitAny: test-only Bolt App stub
      _appOverride: mock.app as any,
    });
    expect(slack.name).toBe('slack');

    // 3. start() dispatches auth.test against the mock with the bot token,
    //    proving the bot token threaded all the way through (resolver → constructor → start).
    const messageHandler = vi.fn();
    await slack.start(messageHandler);
    expect(mock.authTestSpy).toHaveBeenCalledTimes(1);
    expect(mock.authTestSpy).toHaveBeenCalledWith({ token: 'xoxb-resolver-test' });
  });
});
