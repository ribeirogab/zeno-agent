// Spec 2026-05-22 (crons CLI-first) — parse CRON.md files (YAML frontmatter + body).
// Validates: name (required string), description (optional string), schedule
// (required cron expression), enabled (strict boolean), body (≥ 1 non-blank line).

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
