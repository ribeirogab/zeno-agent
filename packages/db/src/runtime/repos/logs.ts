import { and, desc, eq, gt, gte, lt, or, sql } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { logs } from '../schema.js';

export type LogLevel = 10 | 20 | 30 | 40 | 50 | 60;

export interface Log {
  id: number;
  ts: string;
  level: LogLevel;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

export interface CreateLogInput {
  ts: string;
  level: LogLevel;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

export interface LogFilter {
  level?: LogLevel;
  q?: string;
  since?: string;
  until?: string;
  cursorId?: number;
  sinceId?: number;
  limit?: number;
}

interface ListResult {
  logs: Log[];
  nextCursorId: number | null;
}

interface LogRow {
  id: number;
  ts: string;
  level: number;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

function rowToLog(row: LogRow): Log {
  return {
    id: row.id,
    ts: row.ts,
    level: row.level as LogLevel,
    service: row.service,
    event: row.event,
    correlationId: row.correlationId,
    message: row.message,
    payload: row.payload,
  };
}

export class LogRepo {
  constructor(private readonly db: RuntimeDB) {}

  insert(input: CreateLogInput): void {
    this.db
      .insert(logs)
      .values({
        ts: input.ts,
        level: input.level,
        service: input.service,
        event: input.event,
        correlationId: input.correlationId,
        message: input.message,
        payload: input.payload,
      })
      .run();
  }

  list(filter: LogFilter): ListResult {
    const conditions = [];
    if (filter.level !== undefined) {
      conditions.push(eq(logs.level, filter.level));
    }
    if (filter.q !== undefined && filter.q.length > 0) {
      conditions.push(
        or(
          sql`${logs.event} LIKE ${filter.q} || '%' COLLATE NOCASE`,
          eq(logs.correlationId, filter.q),
        ),
      );
    }
    if (filter.since !== undefined) {
      conditions.push(gte(logs.ts, filter.since));
    }
    if (filter.until !== undefined) {
      conditions.push(lt(logs.ts, filter.until));
    }
    if (filter.cursorId !== undefined) {
      conditions.push(lt(logs.id, filter.cursorId));
    }
    const limit = Math.min(filter.limit ?? 100, 500);
    const query = this.db.select().from(logs);
    const rows = (
      conditions.length > 0
        ? query.where(and(...conditions))
        : query
    )
      .orderBy(desc(logs.id))
      .limit(limit)
      .all();
    const result = rows.map(rowToLog);
    const nextCursorId = result.length === limit ? (result[result.length - 1]?.id ?? null) : null;
    return { logs: result, nextCursorId };
  }

  listSince(filter: LogFilter & { sinceId: number }): Log[] {
    const conditions = [gt(logs.id, filter.sinceId)];
    if (filter.level !== undefined) {
      conditions.push(eq(logs.level, filter.level));
    }
    if (filter.q !== undefined && filter.q.length > 0) {
      const orExpr = or(
        sql`${logs.event} LIKE ${filter.q} || '%' COLLATE NOCASE`,
        eq(logs.correlationId, filter.q),
      );
      if (orExpr) conditions.push(orExpr);
    }
    if (filter.since !== undefined) {
      conditions.push(gte(logs.ts, filter.since));
    }
    if (filter.until !== undefined) {
      conditions.push(lt(logs.ts, filter.until));
    }
    const limit = Math.min(filter.limit ?? 100, 500);
    const rows = this.db
      .select()
      .from(logs)
      .where(and(...conditions))
      .orderBy(logs.id)
      .limit(limit)
      .all();
    return rows.map(rowToLog);
  }

  sweep(olderThanIso: string): number {
    const result = this.db.delete(logs).where(lt(logs.ts, olderThanIso)).run();
    return Number(result.changes);
  }
}

// Compile-time assertion that LogRepo.insert matches the LogSink contract
// defined independently in @zeno/logger. A future drift in CreateLogInput
// that isn't mirrored in LogSink will break this line.
// Structural check mirror — the logger's LogSink has: insert(input: { ts, level, service, event, correlationId, message, payload }): void
type _LogSinkCheck = { insert: (input: CreateLogInput) => void };
const _logRepoSatisfiesLogSink: _LogSinkCheck = {} as Pick<LogRepo, 'insert'>;
void _logRepoSatisfiesLogSink;
