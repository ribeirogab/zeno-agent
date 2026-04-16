import { createLogger } from '@zeno/logger';
import type { LogRepo } from '@zeno/storage';

const DAY_MS = 24 * 60 * 60 * 1000;
const logger = createLogger({ service: 'worker' });

export interface LogsRetentionOptions {
  logRepo: LogRepo;
  retentionDays: number;
  now?: () => Date;
  intervalMs?: number;
}

export class LogsRetention {
  private timer: NodeJS.Timeout | null = null;
  private readonly now: () => Date;
  private readonly intervalMs: number;

  constructor(private readonly opts: LogsRetentionOptions) {
    this.now = opts.now ?? (() => new Date());
    this.intervalMs = opts.intervalMs ?? DAY_MS;
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
      logger.info(
        { event: 'logs_retention_swept', count: deleted, threshold: threshold.toISOString() },
        'logs retention sweep complete',
      );
    } catch (err) {
      logger.error(
        {
          event: 'logs_retention_failed',
          err: err instanceof Error ? err.message : String(err),
        },
        'logs retention sweep failed',
      );
    }
  }
}
