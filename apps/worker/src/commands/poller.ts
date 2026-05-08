import type { Command, CommandRepo } from '@zeno/db/runtime';
import { createLogger, type Logger } from '@zeno/logger';
import type { HandlerResult } from '@/commands/dispatcher';

const fallbackLogger = createLogger({ service: 'worker' });

interface CommandsPollerOptions {
  commandRepo: CommandRepo;
  dispatch: (cmd: Command) => Promise<HandlerResult>;
  /** Pass the dbSink-enabled logger from index.ts so command events land in the logs table. */
  logger?: Logger;
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

  private readonly logger: Logger;

  constructor(private readonly opts: CommandsPollerOptions) {
    this.tickMs = opts.tickMs ?? 1000;
    this.logger = opts.logger ?? fallbackLogger;
  }

  start(): void {
    if (this.timer) return;
    const swept = this.opts.commandRepo.sweepStuck();
    if (swept > 0) {
      this.logger.warn(
        { event: 'commands_swept', count: swept },
        'marked stuck commands as failed',
      );
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    this.logger.info(
      { event: 'commands_poller_started', tickMs: this.tickMs },
      'commands poller started',
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info({ event: 'commands_poller_stopped' }, 'commands poller stopped');
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
          this.logger.info(
            {
              event: 'command_processed',
              commandId: cmd.id,
              type: cmd.type,
              correlationId: cmd.correlationId,
            },
            'command processed',
          );
        } else {
          this.opts.commandRepo.finish(cmd.id, 'failed', { error: result.error });
          this.logger.warn(
            {
              event: 'command_failed',
              commandId: cmd.id,
              type: cmd.type,
              correlationId: cmd.correlationId,
              reason: result.error,
            },
            'command failed',
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.opts.commandRepo.finish(cmd.id, 'failed', { error: message });
        this.logger.error(
          { event: 'command_handler_threw', commandId: cmd.id, type: cmd.type, err: message },
          'command handler threw',
        );
      } finally {
        this.inFlight.delete(cmd.id);
      }
    }
  }
}
