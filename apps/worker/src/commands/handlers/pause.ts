import type { CronRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';

const schema = z.object({ cronId: z.string().min(1) });

export function buildPauseHandler(crons: CronRepo): Handler {
  return async (cmd) => {
    const parsed = schema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: 'invalid payload' };
    const cron = crons.get(parsed.data.cronId);
    if (!cron) return { ok: false, error: `cron ${parsed.data.cronId} not found` };
    crons.update(cron.id, { enabled: false });
    return { ok: true, data: { cronId: cron.id } };
  };
}
