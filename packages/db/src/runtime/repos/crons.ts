import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { crons } from '../schema.js';

export interface Cron {
  id: string; // slug == folder name (no longer UUID per spec 0074 crons-cli-first)
  name: string;
  description: string | null;
  schedule: string;
  enabled: boolean;
  contentHash: string;
  mtimeMs: number;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface UpsertCronInput {
  slug: string;
  name: string;
  description: string | null;
  schedule: string;
  enabled: boolean;
  contentHash: string;
  mtimeMs: number;
  nextRunAt: string | null;
}

interface CronRow {
  id: string;
  name: string;
  description: string | null;
  schedule: string;
  enabled: number;
  contentHash: string;
  mtimeMs: number;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

function rowToCron(row: CronRow): Cron {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    schedule: row.schedule,
    enabled: row.enabled === 1,
    contentHash: row.contentHash,
    mtimeMs: row.mtimeMs,
    updatedAt: row.updatedAt,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
  };
}

export class CronRepo {
  constructor(private readonly db: RuntimeDB) {}

  upsertFromFile(input: UpsertCronInput): Cron {
    const now = new Date().toISOString();
    this.db
      .insert(crons)
      .values({
        id: input.slug,
        name: input.name,
        description: input.description,
        schedule: input.schedule,
        enabled: input.enabled ? 1 : 0,
        contentHash: input.contentHash,
        mtimeMs: input.mtimeMs,
        nextRunAt: input.nextRunAt,
        lastError: null,
        lastErrorAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: crons.id,
        set: {
          name: input.name,
          description: input.description,
          schedule: input.schedule,
          enabled: input.enabled ? 1 : 0,
          contentHash: input.contentHash,
          mtimeMs: input.mtimeMs,
          nextRunAt: input.nextRunAt,
          lastError: null,
          lastErrorAt: null,
          updatedAt: now,
        },
      })
      .run();
    const created = this.get(input.slug);
    if (!created) throw new Error(`failed to read back cron ${input.slug}`);
    return created;
  }

  markFailed(slug: string, error: string): Cron | null {
    const now = new Date().toISOString();
    const existing = this.get(slug);
    if (existing) {
      this.db
        .update(crons)
        .set({
          enabled: 0,
          lastError: error,
          lastErrorAt: now,
          updatedAt: now,
        })
        .where(eq(crons.id, slug))
        .run();
    } else {
      this.db
        .insert(crons)
        .values({
          id: slug,
          name: slug,
          description: null,
          schedule: '* * * * *',
          enabled: 0,
          contentHash: '',
          mtimeMs: 0,
          lastError: error,
          lastErrorAt: now,
          updatedAt: now,
        })
        .run();
    }
    return this.get(slug);
  }

  get(slug: string): Cron | null {
    const row = this.db.select().from(crons).where(eq(crons.id, slug)).get();
    return row ? rowToCron(row as unknown as CronRow) : null;
  }

  list(filter?: { enabled?: boolean }): Cron[] {
    const conditions = [];
    if (filter?.enabled !== undefined) {
      conditions.push(eq(crons.enabled, filter.enabled ? 1 : 0));
    }
    const query = this.db.select().from(crons);
    const rows = (conditions.length > 0 ? query.where(and(...conditions)) : query)
      .orderBy(desc(crons.updatedAt))
      .all();
    return rows.map((row) => rowToCron(row as unknown as CronRow));
  }

  delete(slug: string): void {
    this.db.delete(crons).where(eq(crons.id, slug)).run();
  }

  markRun(slug: string, lastRun: Date, nextRun: Date | null): void {
    const now = new Date().toISOString();
    this.db
      .update(crons)
      .set({
        lastRunAt: lastRun.toISOString(),
        nextRunAt: nextRun ? nextRun.toISOString() : null,
        updatedAt: now,
      })
      .where(eq(crons.id, slug))
      .run();
  }

  next(limit = 3): Cron[] {
    const rows = this.db
      .select()
      .from(crons)
      .where(and(eq(crons.enabled, 1), isNotNull(crons.nextRunAt)))
      .orderBy(asc(crons.nextRunAt))
      .limit(limit)
      .all();
    return rows.map((row) => rowToCron(row as unknown as CronRow));
  }
}
