/**
 * Spec 2026-05-11 (channels CLI-first): owns the lifecycle of every channel adapter
 * (slack today, discord/telegram/whatsapp tomorrow). Replaces the one-shot
 * `resolveSlackCredentials + new SlackChannel(...)` block at worker boot.
 *
 * Lifecycle:
 *   - `start(onMessage)` reads `connectors WHERE kind='channel' AND status='enabled'`,
 *     instantiates each adapter via the injected `buildAdapter` factory, and calls
 *     `adapter.start(onMessage)` to register the inbound handler.
 *   - A 2 s poll tick (configurable) re-reads the DB. The manager diffs row + secret
 *     timestamps against its `Map<connectorId, { rowUpdatedAt, secretsMaxUpdatedAt }>`
 *     and spawns / restarts / stops adapters as needed.
 *   - `stop()` cascades `adapter.stop()` for every running adapter and clears the
 *     interval. Idempotent — safe to call twice.
 *
 * `getActiveChannel()` returns the first running adapter or the `NoopChannel`
 * singleton fallback. Outbound callers (cron runner, agent orchestrator) hold a
 * stable `Channel` reference via `asChannel()` — a thin proxy that re-resolves
 * the active adapter on every method call, so hot-reload lands without restart.
 */
import type { ConnectorRepo } from '@zeno/db/runtime';
import type { Logger } from '@zeno/logger';
import { NoopChannel } from '@/channels/noop/noop-channel';
import type {
  Channel,
  MessageHandler,
  MessageTarget,
  OutgoingMessage,
  ReactionEvent,
} from '@/channels/types';

export interface ChannelRow {
  id: string;
  slug: string;
  catalogId: string;
  rowUpdatedAt: string;
  secretsMaxUpdatedAt: string;
}

export interface ChannelManagerDeps {
  /** Runtime DB connector repo. Manager calls `listByKind('channel')` + `getSecrets`. */
  repo: ConnectorRepo;
  logger: Logger;
  /** Factory: turns a `ChannelRow` (row + decrypted secrets snapshot) into an adapter. */
  buildAdapter: (row: ChannelRow) => Channel;
  /** Polling interval in ms. Default 2000. Set to 0 to disable interval (manual reconcile only — tests). */
  pollIntervalMs?: number;
}

const DEFAULT_POLL_MS = 2000;

interface RunningEntry {
  row: ChannelRow;
  adapter: Channel;
}

export class ChannelManager {
  private readonly running = new Map<string, RunningEntry>();
  private readonly noop: NoopChannel;
  private isReconciling = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private onMessage: MessageHandler | null = null;

  constructor(private readonly deps: ChannelManagerDeps) {
    this.noop = new NoopChannel(deps.logger);
  }

  /**
   * Boot: register the inbound handler, run an initial reconcile (which spawns every
   * already-installed adapter), then start the poll tick. `onMessage` is the same
   * handler that was previously passed to `slack.start(...)` at the old call site —
   * the manager forwards it to every adapter it spawns.
   */
  async start(onMessage: MessageHandler): Promise<void> {
    this.onMessage = onMessage;
    await this.reconcile();
    const interval = this.deps.pollIntervalMs ?? DEFAULT_POLL_MS;
    if (interval > 0) {
      this.pollTimer = setInterval(() => {
        this.reconcile().catch((err) => {
          this.deps.logger.error(
            { event: 'channel_manager_reconcile_error', err: String(err) },
            'channel manager reconcile threw',
          );
        });
      }, interval);
      // Don't keep the event loop alive solely for this interval — the worker's
      // dashboard/cron/etc. own that responsibility. SIGTERM clears via stop().
      this.pollTimer.unref();
    }
  }

  /** Cascade-stop every running adapter + clear the poll tick. Idempotent. */
  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const entry of this.running.values()) {
      try {
        await entry.adapter.stop();
        this.deps.logger.info(
          { event: 'channel_adapter_stopped', slug: entry.row.slug },
          'channel adapter stopped',
        );
      } catch (err) {
        this.deps.logger.warn(
          { event: 'channel_adapter_stop_error', slug: entry.row.slug, err: String(err) },
          'adapter.stop() threw — continuing shutdown',
        );
      }
    }
    this.running.clear();
  }

  /**
   * Returns the lone running adapter, or `NoopChannel` when zero are installed.
   * Cheap (Map lookup) — safe to call per send. When the catalog grows beyond
   * one channel, this method's contract changes to "first registered"; the cron
   * runner already targets a `conversationId` so per-channel routing happens
   * upstream of this resolution.
   */
  getActiveChannel(): Channel {
    const first = this.running.values().next().value;
    return first ? first.adapter : this.noop;
  }

  /**
   * Returns a stable `Channel` proxy that resolves to whatever `getActiveChannel()`
   * returns at call time. Cron runner + agent orchestrator hold this reference;
   * the manager swaps the underlying adapter on hot-reload without re-binding.
   */
  asChannel(): Channel {
    const get = (): Channel => this.getActiveChannel();
    return {
      get name() {
        return get().name;
      },
      async start(_onMessage: MessageHandler) {
        // The manager owns adapter lifecycle. Callers must not call start() on the
        // proxy — kept as a no-op so the Channel interface remains usable as a drop-in.
      },
      async send(target: MessageTarget, message: OutgoingMessage) {
        return get().send(target, message);
      },
      async react(target: MessageTarget, emoji: string) {
        return get().react(target, emoji);
      },
      async unreact(target: MessageTarget, emoji: string) {
        return get().unreact(target, emoji);
      },
      async waitForReaction(
        target: MessageTarget,
        emojis: string[],
        timeoutMs: number,
        expectedUserId?: string,
      ): Promise<ReactionEvent | null> {
        return get().waitForReaction(target, emojis, timeoutMs, expectedUserId);
      },
      async openDm(userId: string) {
        return get().openDm(userId);
      },
      async stop() {
        // Lifecycle is owned by the manager; no-op here for the same reason as start().
      },
    };
  }

  /**
   * Reads the desired state (enabled channel rows + their secret timestamps) and
   * reconciles against the running map. Guards against concurrent invocation —
   * a second tick fired while a previous reconcile is in flight returns without
   * touching the DB.
   *
   * Exposed for tests; internal callers don't need to invoke directly.
   */
  async reconcile(): Promise<void> {
    if (this.isReconciling) return;
    this.isReconciling = true;
    try {
      const rows = this.snapshotDesiredState();

      // Stop adapters whose rows vanished or were disabled.
      for (const [id, entry] of this.running) {
        const fresh = rows.find((r) => r.id === id);
        if (!fresh) {
          await this.teardown(entry, 'row_gone');
          this.running.delete(id);
        }
      }

      // Spawn new adapters; restart on row or secret timestamp advance.
      for (const row of rows) {
        const existing = this.running.get(row.id);
        const changed =
          !existing ||
          existing.row.rowUpdatedAt !== row.rowUpdatedAt ||
          existing.row.secretsMaxUpdatedAt !== row.secretsMaxUpdatedAt;
        if (!changed) continue;
        if (existing) {
          await this.teardown(existing, 'secret_or_row_bumped');
        }
        const adapter = this.deps.buildAdapter(row);
        if (this.onMessage) {
          await adapter.start(this.onMessage);
        } else {
          // start() called before manager.start() — should never happen in production;
          // skip rather than blow up so unit tests can construct + reconcile without onMessage.
          await adapter.start(async () => {});
        }
        this.running.set(row.id, { row, adapter });
        this.deps.logger.info(
          { event: 'channel_adapter_started', slug: row.slug, connectorId: row.id },
          'channel adapter started',
        );
      }
    } finally {
      this.isReconciling = false;
    }
  }

  private async teardown(entry: RunningEntry, reason: string): Promise<void> {
    try {
      await entry.adapter.stop();
    } catch (err) {
      this.deps.logger.warn(
        { event: 'channel_adapter_stop_error', slug: entry.row.slug, err: String(err) },
        'adapter.stop() threw during teardown',
      );
    }
    this.deps.logger.info(
      { event: 'channel_adapter_stopped', slug: entry.row.slug, reason },
      'channel adapter stopped',
    );
  }

  private snapshotDesiredState(): ChannelRow[] {
    const rows = this.deps.repo
      .listByKind('channel')
      .filter((r) => r.status === 'enabled')
      .map<ChannelRow>((r) => {
        const secrets = this.deps.repo.getSecrets(r.id);
        // The repo returns plaintext-decrypted values; we don't need the values here,
        // only the max `updatedAt` of any row, to detect rotations between ticks.
        const max = secrets.reduce<string>((acc, s) => {
          return s.updatedAt && s.updatedAt > acc ? s.updatedAt : acc;
        }, '');
        return {
          id: r.id,
          slug: r.slug,
          catalogId: r.catalogId ?? '',
          rowUpdatedAt: r.updatedAt,
          secretsMaxUpdatedAt: max,
        };
      });
    return rows;
  }
}
