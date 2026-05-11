import type { ConnectorRepo } from '@zeno/db/runtime';
import { describe, expect, it, vi } from 'vitest';
import { ChannelManager } from '@/channels/manager';
import { NoopChannel } from '@/channels/noop/noop-channel';
import type { Channel, MessageHandler } from '@/channels/types';

// ─────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => silentLogger,
} as unknown as Parameters<typeof ChannelManager.prototype.constructor>[0]['logger'];

const noopHandler: MessageHandler = async () => {};

interface FakeRow {
  id: string;
  slug: string;
  catalogId: string;
  status: 'enabled' | 'disabled';
  updatedAt: string;
  secretsMaxUpdatedAt: string;
}

function makeRepo(rows: FakeRow[]): ConnectorRepo {
  return {
    listByKind: (_kind: string) =>
      rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        catalogId: r.catalogId,
        status: r.status,
        updatedAt: r.updatedAt,
        // Trim every other column down to placeholders; the manager only reads
        // id/slug/catalogId/status/updatedAt off the row.
        displayName: r.slug,
        description: null,
        instanceLabel: null,
        source: 'catalog' as const,
        transport: 'remote' as const,
        command: null,
        args: null,
        url: null,
        lastError: null,
        lastErrorAt: null,
        lastVerifiedAt: null,
        createdAt: r.updatedAt,
        appId: null,
        kind: 'channel' as const,
      })),
    getSecrets: (connectorId: string) => {
      const row = rows.find((r) => r.id === connectorId);
      if (!row) return [];
      return [
        {
          connectorId,
          key: 'STUB',
          value: 'x',
          isPublic: false,
          updatedAt: row.secretsMaxUpdatedAt,
        },
      ];
    },
    // The manager never calls these; cast to any preserves the structural type.
  } as unknown as ConnectorRepo;
}

function buildFakeAdapter(name = 'slack-fake'): Channel & {
  startCalls: number;
  stopCalls: number;
} {
  let startCalls = 0;
  let stopCalls = 0;
  const channel = {
    name,
    async start(_h: MessageHandler) {
      startCalls++;
    },
    async send() {
      return { messageRef: 'ref' };
    },
    async react() {},
    async unreact() {},
    async waitForReaction() {
      return null;
    },
    async openDm() {
      return 'C1';
    },
    async stop() {
      stopCalls++;
    },
    get startCalls() {
      return startCalls;
    },
    get stopCalls() {
      return stopCalls;
    },
  };
  return channel as unknown as Channel & { startCalls: number; stopCalls: number };
}

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('ChannelManager (spec 2026-05-11)', () => {
  it('getActiveChannel returns NoopChannel when no channels installed', async () => {
    const mgr = new ChannelManager({
      repo: makeRepo([]),
      logger: silentLogger,
      pollIntervalMs: 0,
      buildAdapter: () => buildFakeAdapter(),
    });
    await mgr.start(noopHandler);
    expect(mgr.getActiveChannel()).toBeInstanceOf(NoopChannel);
    await mgr.stop();
  });

  it('start() spawns one adapter per enabled row and calls adapter.start()', async () => {
    const built: ReturnType<typeof buildFakeAdapter>[] = [];
    const mgr = new ChannelManager({
      repo: makeRepo([
        {
          id: 'c1',
          slug: 'slack',
          catalogId: 'slack',
          status: 'enabled',
          updatedAt: 't1',
          secretsMaxUpdatedAt: 's1',
        },
      ]),
      logger: silentLogger,
      pollIntervalMs: 0,
      buildAdapter: () => {
        const a = buildFakeAdapter();
        built.push(a);
        return a;
      },
    });
    await mgr.start(noopHandler);
    expect(built).toHaveLength(1);
    expect(built[0]?.startCalls).toBe(1);
    expect(mgr.getActiveChannel()).toBe(built[0]);
    await mgr.stop();
    expect(built[0]?.stopCalls).toBe(1);
  });

  it('idle reconcile does not re-spawn an unchanged row', async () => {
    const built: ReturnType<typeof buildFakeAdapter>[] = [];
    const rows: FakeRow[] = [
      {
        id: 'c1',
        slug: 'slack',
        catalogId: 'slack',
        status: 'enabled',
        updatedAt: 't1',
        secretsMaxUpdatedAt: 's1',
      },
    ];
    const mgr = new ChannelManager({
      repo: makeRepo(rows),
      logger: silentLogger,
      pollIntervalMs: 0,
      buildAdapter: () => {
        const a = buildFakeAdapter();
        built.push(a);
        return a;
      },
    });
    await mgr.start(noopHandler);
    await mgr.reconcile();
    await mgr.reconcile();
    expect(built).toHaveLength(1); // never re-built
    await mgr.stop();
  });

  it('reconcile restarts adapter when secretsMaxUpdatedAt advances (rotation)', async () => {
    const built: ReturnType<typeof buildFakeAdapter>[] = [];
    const rows: FakeRow[] = [
      {
        id: 'c1',
        slug: 'slack',
        catalogId: 'slack',
        status: 'enabled',
        updatedAt: 't1',
        secretsMaxUpdatedAt: 's1',
      },
    ];
    const mgr = new ChannelManager({
      repo: makeRepo(rows),
      logger: silentLogger,
      pollIntervalMs: 0,
      buildAdapter: () => {
        const a = buildFakeAdapter();
        built.push(a);
        return a;
      },
    });
    await mgr.start(noopHandler);
    expect(built).toHaveLength(1);
    rows[0]!.secretsMaxUpdatedAt = 's2';
    await mgr.reconcile();
    expect(built).toHaveLength(2);
    expect(built[0]?.stopCalls).toBe(1);
    expect(built[1]?.startCalls).toBe(1);
    expect(mgr.getActiveChannel()).toBe(built[1]);
    await mgr.stop();
  });

  it('reconcile stops adapter when row vanishes (uninstall)', async () => {
    const built: ReturnType<typeof buildFakeAdapter>[] = [];
    const rows: FakeRow[] = [
      {
        id: 'c1',
        slug: 'slack',
        catalogId: 'slack',
        status: 'enabled',
        updatedAt: 't1',
        secretsMaxUpdatedAt: 's1',
      },
    ];
    const mgr = new ChannelManager({
      repo: makeRepo(rows),
      logger: silentLogger,
      pollIntervalMs: 0,
      buildAdapter: () => {
        const a = buildFakeAdapter();
        built.push(a);
        return a;
      },
    });
    await mgr.start(noopHandler);
    rows.splice(0, 1); // mutate desired state to "uninstalled"
    await mgr.reconcile();
    expect(built[0]?.stopCalls).toBe(1);
    expect(mgr.getActiveChannel()).toBeInstanceOf(NoopChannel);
    await mgr.stop();
  });

  it('reconcile stops adapter when row.status becomes disabled', async () => {
    const built: ReturnType<typeof buildFakeAdapter>[] = [];
    const rows: FakeRow[] = [
      {
        id: 'c1',
        slug: 'slack',
        catalogId: 'slack',
        status: 'enabled',
        updatedAt: 't1',
        secretsMaxUpdatedAt: 's1',
      },
    ];
    const mgr = new ChannelManager({
      repo: makeRepo(rows),
      logger: silentLogger,
      pollIntervalMs: 0,
      buildAdapter: () => {
        const a = buildFakeAdapter();
        built.push(a);
        return a;
      },
    });
    await mgr.start(noopHandler);
    rows[0]!.status = 'disabled';
    await mgr.reconcile();
    expect(built[0]?.stopCalls).toBe(1);
    expect(mgr.getActiveChannel()).toBeInstanceOf(NoopChannel);
    await mgr.stop();
  });

  it('isReconciling guard coalesces concurrent reconcile invocations', async () => {
    let listCalls = 0;
    // Slow adapter.start forces reconcile to yield mid-loop. Two concurrent reconciles
    // racing on the same in-flight adapter.start() would otherwise both bump listCalls.
    let startReleased: (() => void) | null = null;
    const built: ReturnType<typeof buildFakeAdapter>[] = [];
    const buildAdapter = () => {
      const baseline = buildFakeAdapter(`slack-${built.length}`);
      built.push(baseline);
      return {
        ...baseline,
        async start() {
          await new Promise<void>((resolve) => {
            startReleased = resolve;
          });
        },
      } as Channel;
    };
    const repo = {
      listByKind: () => {
        listCalls++;
        return [
          {
            id: 'c1',
            slug: 'slack',
            catalogId: 'slack',
            status: 'enabled' as const,
            updatedAt: 't1',
            displayName: 'Slack',
            description: null,
            instanceLabel: null,
            source: 'catalog' as const,
            transport: 'remote' as const,
            command: null,
            args: null,
            url: null,
            lastError: null,
            lastErrorAt: null,
            lastVerifiedAt: null,
            createdAt: 't1',
            appId: null,
            kind: 'channel' as const,
          },
        ];
      },
      getSecrets: () => [
        { connectorId: 'c1', key: 'STUB', value: 'x', isPublic: false, updatedAt: 's1' },
      ],
    } as unknown as ConnectorRepo;

    const mgr = new ChannelManager({
      repo,
      logger: silentLogger,
      pollIntervalMs: 0,
      buildAdapter,
    });
    // Kick off the initial reconcile (will block on adapter.start) without awaiting.
    const initial = mgr.start(noopHandler);
    // Spin until the first reconcile is in flight.
    await new Promise((r) => setTimeout(r, 5));
    expect(listCalls).toBe(1);
    // Concurrent reconciles while the first is awaiting adapter.start — guarded.
    const concurrent = Promise.all([mgr.reconcile(), mgr.reconcile()]);
    await new Promise((r) => setTimeout(r, 5));
    expect(listCalls).toBe(1); // still only the in-flight one
    // Release the blocked adapter.start so reconcile can complete.
    startReleased?.();
    await initial;
    await concurrent;
    await mgr.stop();
  });

  it('stop() is idempotent', async () => {
    const built = buildFakeAdapter();
    const mgr = new ChannelManager({
      repo: makeRepo([
        {
          id: 'c1',
          slug: 'slack',
          catalogId: 'slack',
          status: 'enabled',
          updatedAt: 't1',
          secretsMaxUpdatedAt: 's1',
        },
      ]),
      logger: silentLogger,
      pollIntervalMs: 0,
      buildAdapter: () => built,
    });
    await mgr.start(noopHandler);
    await mgr.stop();
    await mgr.stop(); // should not throw, should not double-stop the adapter
    expect(built.stopCalls).toBe(1);
  });

  it('asChannel proxy resolves to the active adapter at call time (hot-reload)', async () => {
    const built: ReturnType<typeof buildFakeAdapter>[] = [];
    const rows: FakeRow[] = [
      {
        id: 'c1',
        slug: 'slack',
        catalogId: 'slack',
        status: 'enabled',
        updatedAt: 't1',
        secretsMaxUpdatedAt: 's1',
      },
    ];
    const mgr = new ChannelManager({
      repo: makeRepo(rows),
      logger: silentLogger,
      pollIntervalMs: 0,
      buildAdapter: () => {
        const a = buildFakeAdapter();
        built.push(a);
        return a;
      },
    });
    await mgr.start(noopHandler);
    const proxy = mgr.asChannel();
    expect(proxy.name).toBe('slack-fake');

    // Rotate: same row, new secret timestamp triggers adapter replacement.
    rows[0]!.secretsMaxUpdatedAt = 's2';
    await mgr.reconcile();
    expect(built).toHaveLength(2);

    // The proxy is the same object reference; calling .send goes to the NEW adapter.
    const sendSpy = vi.spyOn(built[1]!, 'send');
    await proxy.send(
      { platform: 'slack', conversationId: 'C1', threadId: null },
      'hello',
    );
    expect(sendSpy).toHaveBeenCalled();
    await mgr.stop();
  });
});
