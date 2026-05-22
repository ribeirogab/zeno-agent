// Spec 2026-05-22 (crons CLI-first): operator-driven one-shot cron fire.
//
// Payload: `{ slug: string }`. Reads /app/crons/<slug>/CRON.md, parses, runs
// the agent backend with body as user message, returns the result via the
// command row's `result` column. The CLI's `zeno cron test` enqueues this
// command and polls /api/commands/:correlationId for the terminal status.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Command } from '@zeno/db/runtime';
import { z } from 'zod';
import type { AgentBackend } from '@/agent/types';
import type { Handler, HandlerResult } from '@/commands/dispatcher';
import { parseCronFile } from '@/cron/frontmatter';

const payloadSchema = z.object({ slug: z.string().min(1) });

export interface CronTestDeps {
  /** Resolved at runtime by the worker boot — fires the agent backend with the cron prompt. */
  getBackend: () => AgentBackend | null;
  /** Cron root dir inside the container. Defaults to /app/crons. */
  rootDir?: string;
  /** Cron timeout in milliseconds. Defaults to 5 minutes. */
  timeoutMs?: number;
}

export function buildCronTestHandler(deps: CronTestDeps): Handler {
  return async (cmd: Command): Promise<HandlerResult> => {
    const parsed = payloadSchema.safeParse(JSON.parse(cmd.payload ?? '{}'));
    if (!parsed.success) {
      return { ok: false, error: `invalid payload: ${parsed.error.message}` };
    }
    const slug = parsed.data.slug;
    const rootDir = deps.rootDir ?? '/app/crons';
    const path = join(rootDir, slug, 'CRON.md');

    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf-8');
    } catch {
      return { ok: false, error: `cron not found: ${slug}` };
    }

    const cron = parseCronFile(raw);
    if (cron.kind === 'error') {
      return { ok: false, error: `${cron.code}: ${cron.message}` };
    }

    const backend = deps.getBackend();
    if (!backend) {
      return { ok: false, error: 'agent backend not initialized' };
    }

    const t0 = Date.now();
    try {
      const result = await backend.query({
        systemPrompt: '',
        userMessage: cron.value.body,
        cwd: join(rootDir, slug),
        correlationId: cmd.correlationId,
        persistSession: false,
      });
      return {
        ok: true,
        data: {
          sessionId: result.sessionId ?? null,
          status: 'success' as const,
          latencyMs: Date.now() - t0,
        },
      };
    } catch (err) {
      return {
        ok: true,
        data: {
          sessionId: null,
          status: 'failed' as const,
          latencyMs: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  };
}
