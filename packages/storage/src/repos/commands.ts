import { randomUUID } from 'node:crypto';
import type { DB } from '../db.js';
import type { Command, CommandStatus, CommandType, CreateCommandInput } from '../types.js';

interface CommandRow {
  id: string;
  type: string;
  payload: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
  completed_at: string | null;
  result: string | null;
  correlation_id: string;
}

function rowToCommand(row: CommandRow): Command {
  return {
    id: row.id,
    type: row.type as CommandType,
    payload: row.payload,
    status: row.status as CommandStatus,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    completedAt: row.completed_at,
    result: row.result,
    correlationId: row.correlation_id,
  };
}

export class CommandRepo {
  constructor(private readonly db: DB) {}

  enqueue(input: CreateCommandInput): Command {
    const id = randomUUID();
    const payloadJson = input.payload === undefined ? null : JSON.stringify(input.payload);
    this.db
      .prepare(
        `INSERT INTO commands (id, type, payload, correlation_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, input.type, payloadJson, input.correlationId);
    const row = this.db.prepare('SELECT * FROM commands WHERE id = ?').get(id) as
      | CommandRow
      | undefined;
    if (!row) throw new Error(`failed to read back command ${id}`);
    return rowToCommand(row);
  }

  claimPending(limit: number): Command[] {
    const rows = this.db
      .prepare(
        `UPDATE commands
         SET status = 'processing', processed_at = CURRENT_TIMESTAMP
         WHERE id IN (
           SELECT id FROM commands
           WHERE status = 'pending'
           ORDER BY created_at, rowid
           LIMIT ?
         )
         RETURNING *`,
      )
      .all(limit) as CommandRow[];
    return rows.map(rowToCommand);
  }

  finish(
    id: string,
    status: Exclude<CommandStatus, 'pending' | 'processing'>,
    result?: unknown,
  ): void {
    const resultJson = result === undefined ? null : JSON.stringify(result);
    this.db
      .prepare(
        `UPDATE commands
         SET status = ?, completed_at = CURRENT_TIMESTAMP, result = ?
         WHERE id = ?`,
      )
      .run(status, resultJson, id);
  }

  get(id: string): Command | null {
    const row = this.db.prepare('SELECT * FROM commands WHERE id = ?').get(id) as
      | CommandRow
      | undefined;
    return row ? rowToCommand(row) : null;
  }

  recent(limit: number): Command[] {
    const rows = this.db
      .prepare('SELECT * FROM commands ORDER BY created_at DESC, rowid DESC LIMIT ?')
      .all(limit) as CommandRow[];
    return rows.map(rowToCommand);
  }

  sweepStuck(): number {
    const result = this.db
      .prepare(
        `UPDATE commands
         SET status = 'failed', completed_at = CURRENT_TIMESTAMP, result = ?
         WHERE status = 'processing'`,
      )
      .run(JSON.stringify({ error: 'worker_restarted' }));
    return Number(result.changes);
  }
}
