import type { CronRepo } from '@zeno/db/runtime';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';
import { nextRunAfter } from '@/cron/parser';

const schema = z.object({ cronId: z.string().min(1) });

export function buildResumeHandler(crons: CronRepo): Handler {
  return async (cmd) => {
    const parsed = schema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: 'invalid payload' };
    const cron = crons.get(parsed.data.cronId);
    if (!cron) return { ok: false, error: `cron ${parsed.data.cronId} not found` };
    const next = nextRunAfter(cron.schedule, new Date());
    crons.update(cron.id, { enabled: true, nextRunAt: next ? next.toISOString() : null });
    return { ok: true, data: { cronId: cron.id, nextRunAt: next?.toISOString() ?? null } };
  };
}
