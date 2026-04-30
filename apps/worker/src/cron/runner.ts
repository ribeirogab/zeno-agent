import { createLogger } from '@zeno/logger';
import type {
  Cron,
  CronConnectorRepo,
  CronRepo,
  CronRunRepo,
  CronSkillRepo,
  SkillRepo,
} from '@zeno/storage';
import type { AgentBackend } from '@/agent/types';
import type { Channel, MessageTarget } from '@/channels/types';
import { nextRunAfter } from '@/cron/parser';
import { buildZenoContextBlock } from '@/cron/zeno-context-block';
import { readSkillBody } from '@/skills/read-body';

const logger = createLogger({ service: 'worker' });

interface CronRunnerOptions {
  crons: CronRepo;
  cronRuns: CronRunRepo;
  /**
   * Spec 0054: linked skills + connectors per cron. Optional so MockBackend
   * tests + legacy paths that don't exercise injection can omit. When set,
   * the runner reads `listForCron` per fire to build the [zeno_context]
   * block prepended to the cron prompt.
   */
  cronSkills?: CronSkillRepo;
  cronConnectors?: CronConnectorRepo;
  /** Spec 0062: needed to resolve canonicalPath(skill) so the cron runner can read body content from FS at fire time. Optional only for legacy test setups; production wiring always passes it. */
  skillRepo?: SkillRepo;
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
      // Spec 0054: read linked skills + connectors and prepend a
      // [zeno_context] block to the cron prompt. Force-injection means the
      // skill bodies reach context regardless of whether the agent calls a
      // tool. The connector-permission gate stays the single guardrail —
      // linked connectors are a hint surfaced in the block, not a restriction.
      const linkedSkills = this.opts.cronSkills?.listForCron(cron.id) ?? [];
      const linkedConnectors = this.opts.cronConnectors?.listForCron(cron.id) ?? [];
      const linkedSlugs = linkedConnectors.map((c) => c.slug);

      // Spec 0062: body is read from FS at cron fire time. The materializer
      // keeps canonical paths coherent; readSkillBody returns '' on any
      // failure (file missing, malformed frontmatter) so a deleted file
      // surfaces as an empty body rather than a thrown error.
      const blockResult = buildZenoContextBlock(
        linkedSkills.map((s) => ({
          name: s.name,
          body: this.opts.skillRepo ? readSkillBody(s, this.opts.skillRepo) : '',
        })),
        linkedSlugs,
      );

      const userMessage = blockResult.block
        ? `${blockResult.block}\n\n${cron.prompt}`
        : cron.prompt;

      if (linkedSkills.length > 0 || linkedSlugs.length > 0) {
        logger.info(
          {
            event: 'cron_skill_injected',
            cronId: cron.id,
            runId: run.id,
            skills: linkedSkills.map((s) => s.name),
            connectors: linkedSlugs,
            totalBytes: blockResult.truncatedBytes,
          },
          `injected ${linkedSkills.length} skill(s) + ${linkedSlugs.length} connector slug(s) into cron prompt`,
        );
      }
      if (blockResult.droppedSkills.length > 0) {
        logger.warn(
          {
            event: 'cron_skill_truncated',
            cronId: cron.id,
            runId: run.id,
            requestedBytes: blockResult.requestedBytes,
            truncatedBytes: blockResult.truncatedBytes,
            droppedSkills: blockResult.droppedSkills,
          },
          `truncated cron skill bodies past the 20KB cap`,
        );
      }

      // Spec 0054: wrap the backend query in a cron-context scope so the
      // gate's PreToolUse hook can (a) dedupe pre-injected skills against
      // the connector-driven injection and (b) emit `cron_used_unlinked_connector`
      // audit logs. The state is carried via AsyncLocalStorage — race-free
      // under concurrent cron firings (e.g. tick + chat-side `cron_run_now`
      // for a different cron). Backends that don't support the cron scope
      // (MockBackend, plain ClaudeCodeBackend in tests) fall through to a
      // plain query() — no force-injection dedup, but the [zeno_context]
      // block still ensures linked skills reach the prompt.
      const gatedLike = this.opts.backend as Partial<{
        runInCronContext: <T>(
          opts: { skillIds: string[]; audit?: { runId: string; linkedSlugs: string[] } },
          fn: () => Promise<T>,
        ) => Promise<T>;
      }>;
      const queryArgs = {
        systemPrompt: this.opts.getSystemPrompt(),
        userMessage,
        cwd: this.opts.workspaceDir,
        correlationId,
        // Each cron run starts a fresh session — no thread continuity between fires.
        persistSession: false,
      };
      const output = gatedLike.runInCronContext
        ? await gatedLike.runInCronContext(
            {
              skillIds: linkedSkills.map((s) => s.id),
              audit: { runId: run.id, linkedSlugs },
            },
            () => this.opts.backend.query(queryArgs),
          )
        : await this.opts.backend.query(queryArgs);

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
