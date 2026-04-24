import { randomUUID } from 'node:crypto';
import type { DB } from '../db.js';
import type { CronRun, CronRunStatus } from '../types.js';

interface CronRunRow {
  id: string;
  cron_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  output: string | null;
  error: string | null;
}

function rowToCronRun(row: CronRunRow): CronRun {
  return {
    id: row.id,
    cronId: row.cron_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status as CronRunStatus,
    output: row.output,
    error: row.error,
  };
}

export class CronRunRepo {
  constructor(private readonly db: DB) {}

  start(cronId: string): CronRun {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO cron_runs (id, cron_id, status) VALUES (?, ?, 'running')")
      .run(id, cronId);
    const run = this.get(id);
    if (!run) throw new Error(`failed to read back cron_run ${id}`);
    return run;
  }

  finish(
    id: string,
    status: Exclude<CronRunStatus, 'running'>,
    output?: string | null,
    error?: string | null,
  ): void {
    this.db
      .prepare(
        `UPDATE cron_runs
         SET status = ?, finished_at = CURRENT_TIMESTAMP, output = ?, error = ?
         WHERE id = ?`,
      )
      .run(status, output ?? null, error ?? null, id);
  }

  get(id: string): CronRun | null {
    const row = this.db.prepare('SELECT * FROM cron_runs WHERE id = ?').get(id) as
      | CronRunRow
      | undefined;
    return row ? rowToCronRun(row) : null;
  }

  recent(cronId: string, limit = 20): CronRun[] {
    const rows = this.db
      .prepare('SELECT * FROM cron_runs WHERE cron_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(cronId, limit) as CronRunRow[];
    return rows.map(rowToCronRun);
  }

  sparkline(metric: 'runs' | 'failures', hours = 24): Array<{ hour: string; count: number }> {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const condition = metric === 'failures' ? " AND status = 'failed'" : '';
    const rows = this.db
      .prepare(
        `SELECT strftime('%Y-%m-%dT%H:00:00Z', started_at) AS hour, COUNT(*) AS count
         FROM cron_runs
         WHERE started_at >= ?${condition}
         GROUP BY hour
         ORDER BY hour ASC`,
      )
      .all(since) as Array<{ hour: string; count: number }>;

    const buckets = new Map(rows.map((r) => [r.hour, r.count]));
    const result: Array<{ hour: string; count: number }> = [];
    const now = new Date();
    for (let i = hours - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3600_000);
      const key = `${d.toISOString().slice(0, 13)}:00:00Z`;
      result.push({ hour: key, count: buckets.get(key) ?? 0 });
    }
    return result;
  }
}
