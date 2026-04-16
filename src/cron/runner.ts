import type { AgentBackend } from '@/agent/types';
import type { Channel, MessageTarget } from '@/channels/types';
import { nextRunAfter } from '@/cron/parser';
import { logger } from '@/logger';
import type { CronRunRepo } from '@/storage/repos/cron-runs';
import type { CronRepo } from '@/storage/repos/crons';
import type { Cron } from '@/storage/types';

interface CronRunnerOptions {
  crons: CronRepo;
  cronRuns: CronRunRepo;
  backend: AgentBackend;
  /** Returns the current system prompt — called per fire so profile/ hot-reload applies to cron runs too. */
  getSystemPrompt: () => string;
  workspaceDir: string;
  /** Slack (or any other) channel used to post cron output. */
  channel: Channel;
  /** Optional fallback channel id used when a cron has no notify_conversation_id. */
  defaultConversationId?: string | null;
  /** Tick period in ms. Defaults to 60s. Override only in tests. */
  tickMs?: number;
}

/**
 * Periodically wakes up, finds due crons, and runs them through the agent backend.
 * Single-process — concurrency is bounded to one execution per cron at a time.
 */
export class CronRunner {
  private readonly inFlight = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private readonly tickMs: number;

  constructor(private readonly opts: CronRunnerOptions) {
    this.tickMs = opts.tickMs ?? 60_000;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    logger.info({ event: 'cron_runner_started', tickMs: this.tickMs }, 'cron runner started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info({ event: 'cron_runner_stopped' }, 'cron runner stopped');
    }
  }

  /** Public so tests can drive a deterministic tick instead of waiting on setInterval. */
  async tick(now: Date = new Date()): Promise<void> {
    const due = this.opts.crons.due(now);
    if (due.length === 0) return;
    for (const cron of due) {
      if (this.inFlight.has(cron.id)) {
        logger.warn(
          { event: 'cron_skipped_inflight', cronId: cron.id, name: cron.name },
          'previous run still executing, skipping this tick',
        );
        continue;
      }
      this.inFlight.add(cron.id);
      try {
        await this.execute(cron, now);
      } finally {
        this.inFlight.delete(cron.id);
      }
    }
  }

  /** Execute a single cron now (used by both tick and `cron_run_now`). */
  async runOnce(cron: Cron): Promise<void> {
    if (this.inFlight.has(cron.id)) {
      logger.warn(
        { event: 'cron_runonce_inflight', cronId: cron.id },
        'cron already running, run_now is a no-op',
      );
      return;
    }
    this.inFlight.add(cron.id);
    try {
      await this.execute(cron, new Date());
    } finally {
      this.inFlight.delete(cron.id);
    }
  }

  private async execute(cron: Cron, firedAt: Date): Promise<void> {
    const run = this.opts.cronRuns.start(cron.id);
    const correlationId = `cron:${cron.id}:${run.id}`;
    logger.info(
      { event: 'cron_run_start', cronId: cron.id, name: cron.name, runId: run.id, correlationId },
      'cron firing',
    );

    try {
      const output = await this.opts.backend.query({
        systemPrompt: this.opts.getSystemPrompt(),
        userMessage: cron.prompt,
        cwd: this.opts.workspaceDir,
        correlationId,
        // Each cron run starts a fresh session — no thread continuity between fires.
        persistSession: false,
      });

      await this.deliver(cron, output.text);
      this.opts.cronRuns.finish(run.id, 'success', output.text.slice(0, 4000));
      logger.info(
        { event: 'cron_run_success', cronId: cron.id, runId: run.id },
        'cron run completed',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.opts.cronRuns.finish(run.id, 'failed', null, message.slice(0, 4000));
      logger.error(
        { event: 'cron_run_failed', cronId: cron.id, runId: run.id, err: message },
        'cron run failed',
      );
    } finally {
      const next = nextRunAfter(cron.schedule, firedAt);
      this.opts.crons.markRun(cron.id, firedAt, next);
    }
  }

  private async deliver(cron: Cron, text: string): Promise<void> {
    const channelId = cron.notifyConversationId ?? this.opts.defaultConversationId ?? null;
    if (!channelId) {
      logger.warn(
        { event: 'cron_no_destination', cronId: cron.id, name: cron.name },
        'cron has no notify_conversation_id and no default — output discarded',
      );
      return;
    }
    const target: MessageTarget = {
      platform: this.opts.channel.name,
      conversationId: channelId,
      threadId: cron.notifyThreadId,
    };
    try {
      await this.opts.channel.send(target, text);
    } catch (error) {
      logger.error(
        { event: 'cron_delivery_failed', cronId: cron.id, err: String(error) },
        'failed to post cron output to channel',
      );
    }
  }
}
