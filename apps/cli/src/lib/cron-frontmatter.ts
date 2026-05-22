// Spec 2026-05-22 (crons CLI-first) — CLI-side parser + rewriter for CRON.md.
// Mirrors the worker's parser; kept duplicated rather than cross-imported so
// the CLI builds without depending on @zeno/worker.

import { promises as fs } from 'node:fs';
import { CronExpressionParser } from 'cron-parser';
import matter from 'gray-matter';

export interface ParsedCron {
  name: string;
  description: string | null;
  schedule: string;
  enabled: boolean;
  body: string;
}

export type ParseErrorCode =
  | 'invalid_yaml'
  | 'missing_name'
  | 'invalid_schedule'
  | 'invalid_enabled_flag'
  | 'empty_prompt';

export type ParseResult =
  | { kind: 'ok'; value: ParsedCron }
  | { kind: 'error'; code: ParseErrorCode; message: string };

export function parseCronFile(raw: string): ParseResult {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (err) {
    return { kind: 'error', code: 'invalid_yaml', message: (err as Error).message };
  }
  const data = parsed.data as Record<string, unknown>;
  if (typeof data.name !== 'string' || data.name.trim() === '') {
    return { kind: 'error', code: 'missing_name', message: 'name must be a non-empty string' };
  }
  if (typeof data.schedule !== 'string' || data.schedule.trim() === '') {
    return {
      kind: 'error',
      code: 'invalid_schedule',
      message: 'schedule must be a cron expression string',
    };
  }
  try {
    CronExpressionParser.parse(data.schedule);
  } catch (err) {
    return { kind: 'error', code: 'invalid_schedule', message: (err as Error).message };
  }
  if (typeof data.enabled !== 'boolean') {
    return {
      kind: 'error',
      code: 'invalid_enabled_flag',
      message: 'enabled must be a strict boolean (true|false)',
    };
  }
  if (parsed.content.trim() === '') {
    return {
      kind: 'error',
      code: 'empty_prompt',
      message: 'body must contain at least one non-blank line',
    };
  }
  const description =
    typeof data.description === 'string' && data.description.trim() !== ''
      ? data.description
      : null;
  return {
    kind: 'ok',
    value: {
      name: data.name,
      description,
      schedule: data.schedule,
      enabled: data.enabled,
      body: parsed.content,
    },
  };
}

export async function rewriteFrontmatter(
  path: string,
  patch: (data: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const raw = await fs.readFile(path, 'utf-8');
  const parsed = matter(raw);
  const newData = patch(parsed.data as Record<string, unknown>);
  const newBytes = matter.stringify(parsed.content, newData);
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, newBytes, 'utf-8');
  await fs.rename(tmp, path);
}

export const SLUG_RE = /^[a-z][a-z0-9-]*$/;

export function validateSlug(slug: string): { ok: true } | { ok: false; reason: string } {
  if (!SLUG_RE.test(slug)) {
    return { ok: false, reason: `slug must match ${SLUG_RE} (lowercase + kebab-case)` };
  }
  if (slug.length > 63) {
    return { ok: false, reason: 'slug must be ≤ 63 chars' };
  }
  if (['_template', '_README', '.disabled', '.tmp'].includes(slug)) {
    return { ok: false, reason: `slug '${slug}' is reserved` };
  }
  return { ok: true };
}
