import { z } from 'zod';

const schema = z.object({
  // Spec 0058: SLACK_*_TOKEN removed entirely from worker env config.
  // Slack credentials live in the DB connector_secrets table (managed via
  // dashboard install). The resolver at apps/worker/src/channels/slack/resolve-credentials.ts
  // queries the DB directly — no env path remains.
  GH_TOKEN: z.string().min(1),
  CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  WORKSPACE_DIR: z.string().default('/workspace'),
  LOGS_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
});

export type Config = {
  github: { token: string };
  claude: { oauthToken: string };
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  workspaceDir: string;
  logsRetentionDays: number;
};

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env = parsed.data;
  return {
    github: { token: env.GH_TOKEN },
    claude: { oauthToken: env.CLAUDE_CODE_OAUTH_TOKEN },
    logLevel: env.LOG_LEVEL,
    workspaceDir: env.WORKSPACE_DIR,
    logsRetentionDays: env.LOGS_RETENTION_DAYS,
  };
}
