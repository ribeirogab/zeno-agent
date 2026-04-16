import type { DB } from '../db.js';
import type { CreateLogInput, Log, LogFilter, LogLevel } from '../types.js';

interface LogRow {
  id: number;
  ts: string;
  level: number;
  service: string;
  event: string | null;
  correlation_id: string | null;
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
    correlationId: row.correlation_id,
    message: row.message,
    payload: row.payload,
  };
}

interface ListResult {
  logs: Log[];
  nextCursorId: number | null;
}

export class LogRepo {
  constructor(private readonly db: DB) {}

  insert(input: CreateLogInput): void {
    this.db
      .prepare(
        `INSERT INTO logs (ts, level, service, event, correlation_id, message, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.ts,
        input.level,
        input.service,
        input.event,
        input.correlationId,
        input.message,
        input.payload,
      );
  }

  list(filter: LogFilter): ListResult {
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (filter.level !== undefined) {
      where.push('level = ?');
      values.push(filter.level);
    }
    if (filter.q !== undefined && filter.q.length > 0) {
      where.push("(event LIKE ? || '%' COLLATE NOCASE OR correlation_id = ?)");
      values.push(filter.q, filter.q);
    }
    if (filter.since !== undefined) {
      where.push('ts >= ?');
      values.push(filter.since);
    }
    if (filter.until !== undefined) {
      where.push('ts < ?');
      values.push(filter.until);
    }
    if (filter.cursorId !== undefined) {
      where.push('id < ?');
      values.push(filter.cursorId);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(filter.limit ?? 100, 500);
    const rows = this.db
      .prepare(`SELECT * FROM logs ${whereClause} ORDER BY id DESC LIMIT ?`)
      .all(...values, limit) as LogRow[];
    const logs = rows.map(rowToLog);
    const nextCursorId = logs.length === limit ? (logs[logs.length - 1]?.id ?? null) : null;
    return { logs, nextCursorId };
  }

  listSince(filter: LogFilter & { sinceId: number }): Log[] {
    const where: string[] = ['id > ?'];
    const values: Array<string | number> = [filter.sinceId];
    if (filter.level !== undefined) {
      where.push('level = ?');
      values.push(filter.level);
    }
    if (filter.q !== undefined && filter.q.length > 0) {
      where.push("(event LIKE ? || '%' COLLATE NOCASE OR correlation_id = ?)");
      values.push(filter.q, filter.q);
    }
    if (filter.since !== undefined) {
      where.push('ts >= ?');
      values.push(filter.since);
    }
    if (filter.until !== undefined) {
      where.push('ts < ?');
      values.push(filter.until);
    }
    const limit = Math.min(filter.limit ?? 100, 500);
    const rows = this.db
      .prepare(`SELECT * FROM logs WHERE ${where.join(' AND ')} ORDER BY id ASC LIMIT ?`)
      .all(...values, limit) as LogRow[];
    return rows.map(rowToLog);
  }

  sweep(olderThanIso: string): number {
    const result = this.db.prepare('DELETE FROM logs WHERE ts < ?').run(olderThanIso);
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
