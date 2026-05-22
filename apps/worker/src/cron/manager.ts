// Spec 2026-05-22 (crons CLI-first) — filesystem-as-truth cron reconciler.
//
// Walks /app/crons/*/CRON.md every 2 s, parses YAML frontmatter, diffs
// against the slim `crons` DB cache, upserts/deletes rows, schedules
// per-cron `setTimeout` fires. The DB stores no prompt; the file is read
// at fire time so edits land within at most one poll tick.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { CronRepo, CronRunRepo } from '@zeno/db/runtime';
import type { Logger } from '@zeno/logger';
import { CronExpressionParser } from 'cron-parser';
import { type ParsedCron, parseCronFile } from './frontmatter.js';

export interface CronFireResult {
  sessionId: string | null;
  status: 'success' | 'failed';
  error?: string;
}

/** Subset of `AgentBackend.query` the manager actually calls. */
export type CronFireRunner = (slug: string, body: string, cwd: string) => Promise<CronFireResult>;

export interface CronManagerDeps {
  rootDir: string; // /app/crons inside container
  crons: CronRepo;
  cronRuns: CronRunRepo;
  fire: CronFireRunner;
  pollIntervalMs?: number; // default 2000
  logger: Logger;
}

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

export class CronManager {
  private isReconciling = false;
  private timeouts = new Map<string, NodeJS.Timeout>();
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs: number;

  constructor(private readonly deps: CronManagerDeps) {
    this.pollIntervalMs = deps.pollIntervalMs ?? 2000;
  }

  async start(): Promise<void> {
    this.deps.logger.info(
      { event: 'cron_manager_starting', rootDir: this.deps.rootDir },
      'CronManager starting',
    );
    await this.reconcileOnce();
    this.pollTimer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
    if (typeof this.pollTimer.unref === 'function') this.pollTimer.unref();
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const t of this.timeouts.values()) clearTimeout(t);
    this.timeouts.clear();
    this.deps.logger.info({ event: 'cron_manager_stopped' }, 'CronManager stopped');
  }

  /** Manual tick — wraps reconcileOnce with concurrency guard. */
  async tick(): Promise<void> {
    if (this.isReconciling) return;
    this.isReconciling = true;
    try {
      await this.reconcileOnce();
    } catch (err) {
      this.deps.logger.warn(
        { event: 'cron_reconcile_failed', err: String(err) },
        'reconcile threw',
      );
    } finally {
      this.isReconciling = false;
    }
  }

  async reconcileOnce(): Promise<void> {
    const folders = await this.listFolders();
    const dbRows = new Map(this.deps.crons.list().map((r) => [r.id, r]));

    for (const slug of folders) {
      const path = join(this.deps.rootDir, slug, 'CRON.md');
      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(path);
      } catch {
        // Folder exists but no CRON.md → silent skip (operator may be mid-create).
        continue;
      }
      const existing = dbRows.get(slug);
      const mtimeMs = Math.floor(stat.mtimeMs);
      if (existing && existing.mtimeMs === mtimeMs && existing.contentHash !== '') {
        dbRows.delete(slug);
        continue;
      }
      const raw = await fs.readFile(path, 'utf-8');
      const hash = createHash('sha256').update(raw).digest('hex');
      if (existing && existing.contentHash === hash) {
        // mtime changed but bytes identical — update mtime cache, skip re-parse.
        this.deps.crons.upsertFromFile({
          slug,
          name: existing.name,
          description: existing.description,
          schedule: existing.schedule,
          enabled: existing.enabled,
          contentHash: hash,
          mtimeMs,
          nextRunAt: existing.nextRunAt,
        });
        dbRows.delete(slug);
        continue;
      }
      const parsed = parseCronFile(raw);
      if (parsed.kind === 'error') {
        this.deps.crons.markFailed(slug, `${parsed.code}: ${parsed.message}`);
        this.cancelTimeout(slug);
        this.deps.logger.warn(
          { event: 'cron_parse_failed', slug, code: parsed.code, message: parsed.message },
          'cron parse failed',
        );
        dbRows.delete(slug);
        continue;
      }
      const nextRunAt = parsed.value.enabled
        ? (nextFireDate(parsed.value.schedule)?.toISOString() ?? null)
        : null;
      this.deps.crons.upsertFromFile({
        slug,
        name: parsed.value.name,
        description: parsed.value.description,
        schedule: parsed.value.schedule,
        enabled: parsed.value.enabled,
        contentHash: hash,
        mtimeMs,
        nextRunAt,
      });
      this.reschedule(slug, parsed.value);
      this.deps.logger.info(
        { event: 'cron_reconciled', slug, enabled: parsed.value.enabled, nextRunAt },
        'cron reconciled',
      );
      dbRows.delete(slug);
    }

    // Anything still in dbRows had no matching folder — orphaned, delete.
    for (const orphanSlug of dbRows.keys()) {
      this.deps.crons.delete(orphanSlug);
      this.cancelTimeout(orphanSlug);
      this.deps.logger.info(
        { event: 'cron_deleted', slug: orphanSlug },
        'cron folder gone, row removed',
      );
    }
  }

  private async listFolders(): Promise<string[]> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(this.deps.rootDir, { withFileTypes: true });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') return [];
      throw err;
    }
    return entries
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => !name.startsWith('_') && !name.startsWith('.') && SLUG_RE.test(name));
  }

  private reschedule(slug: string, parsed: ParsedCron): void {
    this.cancelTimeout(slug);
    if (!parsed.enabled) return;
    const next = nextFireDate(parsed.schedule);
    if (!next) return;
    const delay = Math.max(0, next.getTime() - Date.now());
    const t = setTimeout(() => {
      void this.fireAndReschedule(slug);
    }, delay);
    if (typeof t.unref === 'function') t.unref();
    this.timeouts.set(slug, t);
  }

  private cancelTimeout(slug: string): void {
    const t = this.timeouts.get(slug);
    if (t) {
      clearTimeout(t);
      this.timeouts.delete(slug);
    }
  }

  private async fireAndReschedule(slug: string): Promise<void> {
    const path = join(this.deps.rootDir, slug, 'CRON.md');
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf-8');
    } catch {
      // file vanished between schedule and fire — let reconcile clean up.
      return;
    }
    const parsed = parseCronFile(raw);
    if (parsed.kind === 'error') {
      this.deps.crons.markFailed(slug, `${parsed.code}: ${parsed.message}`);
      this.cancelTimeout(slug);
      return;
    }

    const run = this.deps.cronRuns.start(slug);
    this.deps.logger.info({ event: 'cron_fired', slug, runId: run.id }, 'cron fired');

    let outcome: CronFireResult;
    try {
      outcome = await this.deps.fire(slug, parsed.value.body, join(this.deps.rootDir, slug));
    } catch (err) {
      outcome = { sessionId: null, status: 'failed', error: (err as Error).message };
    }

    this.deps.cronRuns.finish(run.id, outcome.status, {
      sessionId: outcome.sessionId,
      error: outcome.error ?? null,
    });
    const completedAt = new Date();
    const next = nextFireDate(parsed.value.schedule);
    this.deps.crons.markRun(slug, completedAt, next);

    this.deps.logger.info(
      {
        event: 'cron_finished',
        slug,
        runId: run.id,
        status: outcome.status,
        sessionId: outcome.sessionId,
        nextRunAt: next?.toISOString() ?? null,
      },
      'cron finished',
    );

    // Reschedule next fire only if still enabled (re-read latest parse to honor mid-cycle disables).
    const latest = parseCronFile(await fs.readFile(path, 'utf-8').catch(() => ''));
    if (latest.kind === 'ok' && latest.value.enabled) {
      this.reschedule(slug, latest.value);
    } else {
      this.cancelTimeout(slug);
    }
  }
}

function nextFireDate(schedule: string): Date | null {
  try {
    return CronExpressionParser.parse(schedule).next().toDate();
  } catch {
    return null;
  }
}
