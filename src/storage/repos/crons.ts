import { randomUUID } from 'node:crypto';
import type { DB } from '@/storage/db';
import type { CreateCronInput, Cron, CronSource, UpdateCronInput } from '@/storage/types';

interface CronRow {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  schedule: string;
  enabled: number;
  source: string;
  created_by: string | null;
  notify_conversation_id: string | null;
  notify_thread_id: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

function rowToCron(row: CronRow): Cron {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    prompt: row.prompt,
    schedule: row.schedule,
    enabled: row.enabled === 1,
    source: row.source as CronSource,
    createdBy: row.created_by,
    notifyConversationId: row.notify_conversation_id,
    notifyThreadId: row.notify_thread_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
  };
}

export class CronRepo {
  constructor(private readonly db: DB) {}

  create(input: CreateCronInput): Cron {
    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO crons (
           id, name, description, prompt, schedule, enabled, source,
           created_by, notify_conversation_id, notify_thread_id, next_run_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.description ?? null,
        input.prompt,
        input.schedule,
        input.enabled === false ? 0 : 1,
        input.source,
        input.createdBy ?? null,
        input.notifyConversationId ?? null,
        input.notifyThreadId ?? null,
        input.nextRunAt ?? null,
      );
    const created = this.get(id);
    if (!created) throw new Error(`failed to read back cron ${id} after insert`);
    return created;
  }

  update(id: string, patch: UpdateCronInput): Cron {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.description !== undefined) {
      fields.push('description = ?');
      values.push(patch.description);
    }
    if (patch.prompt !== undefined) {
      fields.push('prompt = ?');
      values.push(patch.prompt);
    }
    if (patch.schedule !== undefined) {
      fields.push('schedule = ?');
      values.push(patch.schedule);
    }
    if (patch.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(patch.enabled ? 1 : 0);
    }
    if (patch.notifyConversationId !== undefined) {
      fields.push('notify_conversation_id = ?');
      values.push(patch.notifyConversationId);
    }
    if (patch.notifyThreadId !== undefined) {
      fields.push('notify_thread_id = ?');
      values.push(patch.notifyThreadId);
    }
    if (patch.lastRunAt !== undefined) {
      fields.push('last_run_at = ?');
      values.push(patch.lastRunAt);
    }
    if (patch.nextRunAt !== undefined) {
      fields.push('next_run_at = ?');
      values.push(patch.nextRunAt);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');

    this.db.prepare(`UPDATE crons SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
    const updated = this.get(id);
    if (!updated) throw new Error(`cron ${id} not found after update`);
    return updated;
  }

  get(id: string): Cron | null {
    const row = this.db.prepare('SELECT * FROM crons WHERE id = ?').get(id) as CronRow | undefined;
    return row ? rowToCron(row) : null;
  }

  list(filter?: { enabled?: boolean; source?: CronSource }): Cron[] {
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (filter?.enabled !== undefined) {
      where.push('enabled = ?');
      values.push(filter.enabled ? 1 : 0);
    }
    if (filter?.source !== undefined) {
      where.push('source = ?');
      values.push(filter.source);
    }
    const sql = `SELECT * FROM crons${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`;
    const rows = this.db.prepare(sql).all(...values) as CronRow[];
    return rows.map(rowToCron);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM crons WHERE id = ?').run(id);
  }

  /** Crons that are enabled and whose next_run_at is in the past (or now). */
  due(now: Date): Cron[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM crons
         WHERE enabled = 1
           AND next_run_at IS NOT NULL
           AND next_run_at <= ?
         ORDER BY next_run_at ASC`,
      )
      .all(now.toISOString()) as CronRow[];
    return rows.map(rowToCron);
  }

  markRun(id: string, lastRun: Date, nextRun: Date | null): void {
    this.db
      .prepare(
        `UPDATE crons
         SET last_run_at = ?, next_run_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(lastRun.toISOString(), nextRun ? nextRun.toISOString() : null, id);
  }

  /** Replace the static-source cron set atomically (used when reloading crons.yaml). */
  replaceStaticSet(crons: CreateCronInput[]): void {
    const tx = this.db.transaction((items: CreateCronInput[]) => {
      this.db.prepare("DELETE FROM crons WHERE source = 'static'").run();
      for (const item of items) {
        this.create({ ...item, source: 'static' });
      }
    });
    tx(crons);
  }
}
