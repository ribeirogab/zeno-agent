import type { CronRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';
import { nextRunAfter, validateSchedule } from '@/cron/parser';

const schema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  description: z.string().optional(),
  prompt: z.string().min(1),
  schedule: z.string().min(1),
  notifyConversationId: z.string().nullish(),
  notifyThreadId: z.string().nullish(),
});

export function buildCreateHandler(crons: CronRepo): Handler {
  return async (cmd) => {
    const parsed = schema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: 'invalid payload' };
    try {
      validateSchedule(parsed.data.schedule);
    } catch (err) {
      return { ok: false, error: `invalid schedule: ${String(err)}` };
    }
    const next = nextRunAfter(parsed.data.schedule, new Date());
    const cron = crons.create({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      prompt: parsed.data.prompt,
      schedule: parsed.data.schedule,
      enabled: true,
      source: 'chat',
      createdBy: 'dashboard',
      notifyConversationId: parsed.data.notifyConversationId ?? null,
      notifyThreadId: parsed.data.notifyThreadId ?? null,
      nextRunAt: next ? next.toISOString() : null,
    });
    return { ok: true, data: { cronId: cron.id } };
  };
}
