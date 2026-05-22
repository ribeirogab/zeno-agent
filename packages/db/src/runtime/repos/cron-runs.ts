import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { cronRuns } from '../schema.js';

export type CronRunStatus = 'running' | 'success' | 'failed' | 'skipped';

export interface CronRun {
  id: string;
  cronId: string;
  startedAt: string;
  finishedAt: string | null;
  status: CronRunStatus;
  output: string | null;
  error: string | null;
  sessionId: string | null;
}

interface CronRunRow {
  id: string;
  cronId: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  output: string | null;
  error: string | null;
  sessionId: string | null;
}

function rowToCronRun(row: CronRunRow): CronRun {
  return {
    id: row.id,
    cronId: row.cronId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    status: row.status as CronRunStatus,
    output: row.output,
    error: row.error,
    sessionId: row.sessionId,
  };
}

export class CronRunRepo {
  constructor(private readonly db: RuntimeDB) {}

  start(cronId: string): CronRun {
    const id = randomUUID();
    this.db.insert(cronRuns).values({ id, cronId, status: 'running' }).run();
    const run = this.get(id);
    if (!run) throw new Error(`failed to read back cron_run ${id}`);
    return run;
  }

  finish(
    id: string,
    status: Exclude<CronRunStatus, 'running'>,
    options?: {
      output?: string | null;
      error?: string | null;
      sessionId?: string | null;
    },
  ): void {
    this.db
      .update(cronRuns)
      .set({
        status,
        finishedAt: sql`CURRENT_TIMESTAMP`,
        output: options?.output ?? null,
        error: options?.error ?? null,
        sessionId: options?.sessionId ?? null,
      })
      .where(eq(cronRuns.id, id))
      .run();
  }

  get(id: string): CronRun | null {
    const row = this.db.select().from(cronRuns).where(eq(cronRuns.id, id)).get();
    return row ? rowToCronRun(row as unknown as CronRunRow) : null;
  }

  recent(cronId: string, limit = 20): CronRun[] {
    const rows = this.db
      .select()
      .from(cronRuns)
      .where(eq(cronRuns.cronId, cronId))
      .orderBy(desc(cronRuns.startedAt))
      .limit(limit)
      .all();
    return rows.map((row) => rowToCronRun(row as unknown as CronRunRow));
  }

  sparkline(metric: 'runs' | 'failures', hours = 24): Array<{ hour: string; count: number }> {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const conditions = [gte(cronRuns.startedAt, since)];
    if (metric === 'failures') {
      conditions.push(eq(cronRuns.status, 'failed'));
    }
    const rows = this.db.all<{ hour: string; count: number }>(sql`
      SELECT strftime('%Y-%m-%dT%H:00:00Z', started_at) AS hour, COUNT(*) AS count
      FROM ${cronRuns}
      WHERE ${and(...conditions)}
      GROUP BY hour
      ORDER BY hour ASC
    `);

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
