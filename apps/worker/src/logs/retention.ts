import { createLogger, type Logger } from '@zeno/logger';
import type { LogRepo } from '@zeno/storage';

const DAY_MS = 24 * 60 * 60 * 1000;
const fallbackLogger = createLogger({ service: 'worker' });

export interface LogsRetentionOptions {
  logRepo: LogRepo;
  retentionDays: number;
  /** Pass the dbSink-enabled logger from index.ts so sweep events land in the logs table. */
  logger?: Logger;
  now?: () => Date;
  intervalMs?: number;
}

export class LogsRetention {
  private timer: NodeJS.Timeout | null = null;
  private readonly now: () => Date;
  private readonly intervalMs: number;
  private readonly logger: Logger;

  constructor(private readonly opts: LogsRetentionOptions) {
    this.now = opts.now ?? (() => new Date());
    this.intervalMs = opts.intervalMs ?? DAY_MS;
    this.logger = opts.logger ?? fallbackLogger;
  }

  start(): void {
    if (this.timer) return;
    this.runSweep();
    this.timer = setInterval(() => this.runSweep(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private runSweep(): void {
    const threshold = new Date(this.now().getTime() - this.opts.retentionDays * DAY_MS);
    try {
      const deleted = this.opts.logRepo.sweep(threshold.toISOString());
      this.logger.info(
        { event: 'logs_retention_swept', count: deleted, threshold: threshold.toISOString() },
        'logs retention sweep complete',
      );
    } catch (err) {
      this.logger.error(
        {
          event: 'logs_retention_failed',
          err: err instanceof Error ? err.message : String(err),
        },
        'logs retention sweep failed',
      );
    }
  }
}
