import { randomUUID } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { commands } from '../schema.js';

export type CommandType =
  | 'cron_create'
  | 'cron_pause'
  | 'cron_resume'
  | 'cron_run_now'
  | 'cron_delete'
  // Spec 0067 C: 'worker_restart' removed. Historical rows in the
  // commands table keep their type string; the dispatcher silently
  // skips unknown types.
  | 'connector_create'
  | 'connector_update'
  | 'connector_refresh_tools'
  | 'connector_uninstall'
  // Spec 0044: GitHub App lifecycle commands. Spec 0051: `app_pem_rotated`
  // removed (rotate-PEM feature retired; uninstall+reinstall is the path).
  | 'app_install'
  | 'app_uninstall';

export type CommandStatus = 'pending' | 'processing' | 'success' | 'failed';

export interface Command {
  id: string;
  type: CommandType;
  payload: string | null;
  status: CommandStatus;
  createdAt: string;
  processedAt: string | null;
  completedAt: string | null;
  result: string | null;
  correlationId: string;
}

export interface CreateCommandInput {
  type: CommandType;
  payload?: unknown;
  correlationId: string;
}

interface CommandRow {
  id: string;
  type: string;
  payload: string | null;
  status: string;
  createdAt: string;
  processedAt: string | null;
  completedAt: string | null;
  result: string | null;
  correlationId: string;
}

function rowToCommand(row: CommandRow): Command {
  return {
    id: row.id,
    type: row.type as CommandType,
    payload: row.payload,
    status: row.status as CommandStatus,
    createdAt: row.createdAt,
    processedAt: row.processedAt,
    completedAt: row.completedAt,
    result: row.result,
    correlationId: row.correlationId,
  };
}

export class CommandRepo {
  constructor(private readonly db: RuntimeDB) {}

  enqueue(input: CreateCommandInput): Command {
    const id = randomUUID();
    const payloadJson = input.payload === undefined ? null : JSON.stringify(input.payload);
    this.db
      .insert(commands)
      .values({
        id,
        type: input.type,
        payload: payloadJson,
        correlationId: input.correlationId,
      })
      .run();
    const row = this.db.select().from(commands).where(eq(commands.id, id)).get();
    if (!row) throw new Error(`failed to read back command ${id}`);
    return rowToCommand(row);
  }

  claimPending(limit: number): Command[] {
    // SQLite UPDATE ... RETURNING with subquery: not directly expressible via
    // drizzle's update().returning() with a sub-select on a different alias of
    // the same table. Use the sql template tag to keep the atomic semantics.
    const rows = this.db.all<CommandRow>(sql`
      UPDATE commands
      SET status = 'processing', processed_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT id FROM commands
        WHERE status = 'pending'
        ORDER BY created_at, rowid
        LIMIT ${limit}
      )
      RETURNING
        id AS id,
        type AS type,
        payload AS payload,
        status AS status,
        created_at AS createdAt,
        processed_at AS processedAt,
        completed_at AS completedAt,
        result AS result,
        correlation_id AS correlationId
    `);
    return rows.map(rowToCommand);
  }

  finish(
    id: string,
    status: Exclude<CommandStatus, 'pending' | 'processing'>,
    result?: unknown,
  ): void {
    const resultJson = result === undefined ? null : JSON.stringify(result);
    this.db
      .update(commands)
      .set({
        status,
        completedAt: sql`CURRENT_TIMESTAMP`,
        result: resultJson,
      })
      .where(eq(commands.id, id))
      .run();
  }

  get(id: string): Command | null {
    const row = this.db.select().from(commands).where(eq(commands.id, id)).get();
    return row ? rowToCommand(row) : null;
  }

  findByCorrelationId(correlationId: string): Command | null {
    const row = this.db
      .select()
      .from(commands)
      .where(eq(commands.correlationId, correlationId))
      .get();
    return row ? rowToCommand(row) : null;
  }

  recent(limit: number): Command[] {
    const rows = this.db
      .select()
      .from(commands)
      .orderBy(desc(commands.createdAt), sql`rowid DESC`)
      .limit(limit)
      .all();
    return rows.map(rowToCommand);
  }

  sweepStuck(): number {
    const result = this.db
      .update(commands)
      .set({
        status: 'failed',
        completedAt: sql`CURRENT_TIMESTAMP`,
        result: JSON.stringify({ error: 'worker_restarted' }),
      })
      .where(eq(commands.status, 'processing'))
      .run();
    return Number(result.changes);
  }
}
