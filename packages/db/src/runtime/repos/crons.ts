import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { crons } from '../schema.js';

export type CronSource = 'static' | 'chat';

export interface Cron {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  schedule: string;
  enabled: boolean;
  source: CronSource;
  createdBy: string | null;
  notifyConversationId: string | null;
  notifyThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface CreateCronInput {
  id?: string;
  name: string;
  description?: string | null;
  prompt: string;
  schedule: string;
  enabled?: boolean;
  source: CronSource;
  createdBy?: string | null;
  notifyConversationId?: string | null;
  notifyThreadId?: string | null;
  nextRunAt?: string | null;
}

export interface UpdateCronInput {
  name?: string;
  description?: string | null;
  prompt?: string;
  schedule?: string;
  enabled?: boolean;
  notifyConversationId?: string | null;
  notifyThreadId?: string | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
}

interface CronRow {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  schedule: string;
  enabled: number;
  source: string;
  createdBy: string | null;
  notifyConversationId: string | null;
  notifyThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
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
    createdBy: row.createdBy,
    notifyConversationId: row.notifyConversationId,
    notifyThreadId: row.notifyThreadId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
  };
}

export class CronRepo {
  constructor(private readonly db: RuntimeDB) {}

  create(input: CreateCronInput): Cron {
    const id = input.id ?? randomUUID();
    this.db
      .insert(crons)
      .values({
        id,
        name: input.name,
        description: input.description ?? null,
        prompt: input.prompt,
        schedule: input.schedule,
        enabled: input.enabled === false ? 0 : 1,
        source: input.source,
        createdBy: input.createdBy ?? null,
        notifyConversationId: input.notifyConversationId ?? null,
        notifyThreadId: input.notifyThreadId ?? null,
        nextRunAt: input.nextRunAt ?? null,
      })
      .run();
    const created = this.get(id);
    if (!created) throw new Error(`failed to read back cron ${id} after insert`);
    return created;
  }

  update(id: string, patch: UpdateCronInput): Cron {
    const set: Record<string, unknown> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.prompt !== undefined) set.prompt = patch.prompt;
    if (patch.schedule !== undefined) set.schedule = patch.schedule;
    if (patch.enabled !== undefined) set.enabled = patch.enabled ? 1 : 0;
    if (patch.notifyConversationId !== undefined) {
      set.notifyConversationId = patch.notifyConversationId;
    }
    if (patch.notifyThreadId !== undefined) set.notifyThreadId = patch.notifyThreadId;
    if (patch.lastRunAt !== undefined) set.lastRunAt = patch.lastRunAt;
    if (patch.nextRunAt !== undefined) set.nextRunAt = patch.nextRunAt;

    set.updatedAt = sql`CURRENT_TIMESTAMP`;

    this.db.update(crons).set(set).where(eq(crons.id, id)).run();
    const updated = this.get(id);
    if (!updated) throw new Error(`cron ${id} not found after update`);
    return updated;
  }

  get(id: string): Cron | null {
    const row = this.db.select().from(crons).where(eq(crons.id, id)).get();
    return row ? rowToCron(row as unknown as CronRow) : null;
  }

  list(filter?: { enabled?: boolean; source?: CronSource }): Cron[] {
    const conditions = [];
    if (filter?.enabled !== undefined) {
      conditions.push(eq(crons.enabled, filter.enabled ? 1 : 0));
    }
    if (filter?.source !== undefined) {
      conditions.push(eq(crons.source, filter.source));
    }
    const query = this.db.select().from(crons);
    const rows = (conditions.length > 0 ? query.where(and(...conditions)) : query)
      .orderBy(desc(crons.createdAt))
      .all();
    return rows.map((row) => rowToCron(row as unknown as CronRow));
  }

  delete(id: string): void {
    this.db.delete(crons).where(eq(crons.id, id)).run();
  }

  /** Crons that are enabled and whose next_run_at is in the past (or now). */
  due(now: Date): Cron[] {
    const rows = this.db
      .select()
      .from(crons)
      .where(
        and(
          eq(crons.enabled, 1),
          isNotNull(crons.nextRunAt),
          lte(crons.nextRunAt, now.toISOString()),
        ),
      )
      .orderBy(asc(crons.nextRunAt))
      .all();
    return rows.map((row) => rowToCron(row as unknown as CronRow));
  }

  markRun(id: string, lastRun: Date, nextRun: Date | null): void {
    this.db
      .update(crons)
      .set({
        lastRunAt: lastRun.toISOString(),
        nextRunAt: nextRun ? nextRun.toISOString() : null,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(crons.id, id))
      .run();
  }

  next(limit = 3): Array<Cron> {
    const rows = this.db
      .select()
      .from(crons)
      .where(and(eq(crons.enabled, 1), isNotNull(crons.nextRunAt)))
      .orderBy(asc(crons.nextRunAt))
      .limit(limit)
      .all();
    return rows.map((row) => rowToCron(row as unknown as CronRow));
  }

  /** Replace the static-source cron set atomically (used when reloading crons.yaml). */
  replaceStaticSet(items: CreateCronInput[]): void {
    this.db.transaction((tx) => {
      tx.delete(crons).where(eq(crons.source, 'static')).run();
      for (const item of items) {
        const id = item.id ?? randomUUID();
        tx.insert(crons)
          .values({
            id,
            name: item.name,
            description: item.description ?? null,
            prompt: item.prompt,
            schedule: item.schedule,
            enabled: item.enabled === false ? 0 : 1,
            source: 'static',
            createdBy: item.createdBy ?? null,
            notifyConversationId: item.notifyConversationId ?? null,
            notifyThreadId: item.notifyThreadId ?? null,
            nextRunAt: item.nextRunAt ?? null,
          })
          .run();
      }
    });
  }
}
