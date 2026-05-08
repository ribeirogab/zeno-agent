import { desc, eq, sql } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { sessions } from '../schema.js';

export interface Session {
  threadId: string;
  sessionId: string;
  createdAt: string;
  lastUsedAt: string;
}

export class SessionRepo {
  constructor(private readonly db: RuntimeDB) {}

  upsert(threadId: string, sessionId: string): void {
    this.db
      .insert(sessions)
      .values({ threadId, sessionId })
      .onConflictDoUpdate({
        target: sessions.threadId,
        set: { sessionId, lastUsedAt: sql`CURRENT_TIMESTAMP` },
      })
      .run();
  }

  get(threadId: string): string | null {
    const row = this.db
      .select({ sessionId: sessions.sessionId })
      .from(sessions)
      .where(eq(sessions.threadId, threadId))
      .get();
    return row?.sessionId ?? null;
  }

  delete(threadId: string): void {
    this.db.delete(sessions).where(eq(sessions.threadId, threadId)).run();
  }

  touch(threadId: string): void {
    this.db
      .update(sessions)
      .set({ lastUsedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(sessions.threadId, threadId))
      .run();
  }

  list(): Session[] {
    const rows = this.db.select().from(sessions).orderBy(desc(sessions.lastUsedAt)).all();
    return rows.map((row) => ({
      threadId: row.threadId,
      sessionId: row.sessionId,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    }));
  }

  sparkline(hours = 24): Array<{ hour: string; count: number }> {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const rows = this.db.all<{ hour: string; count: number }>(sql`
      SELECT strftime('%Y-%m-%dT%H:00:00Z', last_used_at) AS hour, COUNT(*) AS count
      FROM ${sessions}
      WHERE last_used_at >= ${since}
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
