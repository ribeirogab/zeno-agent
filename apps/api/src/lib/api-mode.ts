import { z } from 'zod';

export type ApiWriteMode = 'cli' | 'dashboard';

const schema = z.enum(['cli', 'dashboard']).default('cli');

export function parseApiWriteMode(env: string | undefined): ApiWriteMode {
  return schema.parse(env ?? 'cli');
}
