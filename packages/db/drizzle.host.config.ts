import type { Config } from 'drizzle-kit';

export default {
  schema: './src/host/schema.ts',
  out: './src/host/migrations',
  dialect: 'sqlite',
} satisfies Config;
