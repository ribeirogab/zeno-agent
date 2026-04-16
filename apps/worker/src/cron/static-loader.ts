import { existsSync, readFileSync } from 'node:fs';
import { createLogger } from '@zeno/logger';
import type { CreateCronInput } from '@zeno/storage';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { nextRunAfter, validateSchedule } from '@/cron/parser';

const logger = createLogger({ service: 'worker' });

const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

const NotifySchema = z
  .object({
    conversation_id: z.string().min(1).nullable().optional(),
    thread_id: z.string().min(1).nullable().optional(),
  })
  .optional();

const StaticCronSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'name must be lowercase letters, digits, and hyphens'),
  description: z.string().optional(),
  schedule: z.string().min(1),
  prompt: z.string().min(1),
  notify: NotifySchema,
});

const StaticCronFileSchema = z.object({
  crons: z.array(z.unknown()).default([]),
});

function findProfileFile(filename: string): string | null {
  for (const base of PROFILE_CANDIDATES) {
    const path = `${base}/${filename}`;
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Read profile/crons.yaml and produce a list of valid CreateCronInput entries.
 * Bad entries are logged + skipped so a single typo can't take down the whole set.
 * Returns an empty array if the file is missing or `crons:` is empty.
 */
export function loadStaticCrons(now: Date = new Date()): CreateCronInput[] {
  const path = findProfileFile('crons.yaml');
  if (!path) {
    logger.info({ event: 'cron_yaml_missing' }, 'profile/crons.yaml not found');
    return [];
  }

  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = parseYaml(raw) ?? {};
  } catch (error) {
    logger.error(
      { event: 'cron_yaml_invalid', err: String(error) },
      'crons.yaml is malformed, skipping all static crons',
    );
    return [];
  }

  const fileResult = StaticCronFileSchema.safeParse(parsed);
  if (!fileResult.success) {
    logger.error(
      { event: 'cron_yaml_schema_error', err: fileResult.error.message },
      'crons.yaml top-level shape is invalid, skipping all static crons',
    );
    return [];
  }

  const out: CreateCronInput[] = [];
  for (const [index, entry] of fileResult.data.crons.entries()) {
    const result = StaticCronSchema.safeParse(entry);
    if (!result.success) {
      logger.warn(
        { event: 'cron_yaml_entry_skipped', index, err: result.error.message },
        'invalid cron entry skipped',
      );
      continue;
    }
    const cron = result.data;
    try {
      validateSchedule(cron.schedule);
    } catch (error) {
      logger.warn(
        { event: 'cron_yaml_bad_schedule', name: cron.name, err: String(error) },
        'cron has invalid schedule expression, skipped',
      );
      continue;
    }
    const next = nextRunAfter(cron.schedule, now);
    out.push({
      name: cron.name,
      description: cron.description ?? null,
      prompt: cron.prompt,
      schedule: cron.schedule,
      enabled: true,
      source: 'static',
      createdBy: 'profile/crons.yaml',
      notifyConversationId: cron.notify?.conversation_id ?? null,
      notifyThreadId: cron.notify?.thread_id ?? null,
      nextRunAt: next ? next.toISOString() : null,
    });
  }
  return out;
}
