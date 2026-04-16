import { CronExpressionParser } from 'cron-parser';

/**
 * Parse a cron expression and validate it. Throws on invalid input.
 * The thrown error message is forwarded to users (Slack tool replies, YAML loader logs).
 */
export function validateSchedule(expression: string, tz?: string): void {
  CronExpressionParser.parse(expression, tz ? { tz } : undefined);
}

/**
 * Compute the next firing time for a cron expression after `from`.
 * Returns null if the expression has no future occurrences (rare for standard 5-field crons).
 */
export function nextRunAfter(expression: string, from: Date, tz?: string): Date | null {
  const expr = CronExpressionParser.parse(expression, {
    currentDate: from,
    ...(tz ? { tz } : {}),
  });
  if (!expr.hasNext()) return null;
  return expr.next().toDate();
}
