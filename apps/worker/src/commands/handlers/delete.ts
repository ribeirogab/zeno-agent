import type { CronRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';

const schema = z.object({ cronId: z.string().min(1) });

export function buildDeleteHandler(crons: CronRepo): Handler {
  return async (cmd) => {
    const parsed = schema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: 'invalid payload' };
    const cron = crons.get(parsed.data.cronId);
    if (!cron) return { ok: false, error: `cron ${parsed.data.cronId} not found` };
    if (cron.source === 'static') return { ok: false, error: 'cannot delete static cron' };
    crons.delete(cron.id);
    return { ok: true, data: { cronId: cron.id } };
  };
}
