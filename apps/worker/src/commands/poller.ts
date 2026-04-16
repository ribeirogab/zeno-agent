import { createLogger } from '@zeno/logger';
import type { Command, CommandRepo } from '@zeno/storage';
import type { HandlerResult } from '@/commands/dispatcher';

const logger = createLogger({ service: 'worker' });

interface CommandsPollerOptions {
  commandRepo: CommandRepo;
  dispatch: (cmd: Command) => Promise<HandlerResult>;
  tickMs?: number;
}

export class CommandsPoller {
  private timer: NodeJS.Timeout | null = null;
  /**
   * Reentrancy guard. Rows are only ever claimed once from the DB, so this
   * protects the in-memory handler chain when tick() re-enters while a slow
   * handler is still awaiting. Keyed by cmd.id.
   */
  private readonly inFlight = new Set<string>();
  private readonly tickMs: number;

  constructor(private readonly opts: CommandsPollerOptions) {
    this.tickMs = opts.tickMs ?? 1000;
  }

  start(): void {
    if (this.timer) return;
    const swept = this.opts.commandRepo.sweepStuck();
    if (swept > 0) {
      logger.warn({ event: 'commands_swept', count: swept }, 'marked stuck commands as failed');
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    logger.info(
      { event: 'commands_poller_started', tickMs: this.tickMs },
      'commands poller started',
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info({ event: 'commands_poller_stopped' }, 'commands poller stopped');
    }
  }

  /** Exposed for tests. Runs one claim → dispatch loop sequentially. */
  async tick(): Promise<void> {
    const claimed = this.opts.commandRepo.claimPending(10);
    for (const cmd of claimed) {
      if (this.inFlight.has(cmd.id)) continue;
      this.inFlight.add(cmd.id);
      try {
        const result = await this.opts.dispatch(cmd);
        if (result.ok) {
          this.opts.commandRepo.finish(cmd.id, 'success', result.data ?? {});
        } else {
          this.opts.commandRepo.finish(cmd.id, 'failed', { error: result.error });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.opts.commandRepo.finish(cmd.id, 'failed', { error: message });
        logger.error(
          { event: 'command_handler_threw', commandId: cmd.id, type: cmd.type, err: message },
          'command handler threw',
        );
      } finally {
        this.inFlight.delete(cmd.id);
      }
    }
  }
}
