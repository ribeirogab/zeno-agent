import type { Config } from 'drizzle-kit';

export default {
  schema: './src/runtime/schema.ts',
  out: './src/runtime/migrations',
  dialect: 'sqlite',
} satisfies Config;
