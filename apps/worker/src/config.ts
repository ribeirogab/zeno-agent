import { z } from 'zod';

const schema = z.object({
  SLACK_APP_TOKEN: z.string().startsWith('xapp-'),
  SLACK_BOT_TOKEN: z.string().startsWith('xoxb-'),
  GH_TOKEN: z.string().min(1),
  CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  WORKSPACE_DIR: z.string().default('/workspace'),
  LOGS_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
});

export type Config = {
  slack: { appToken: string; botToken: string };
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
    slack: { appToken: env.SLACK_APP_TOKEN, botToken: env.SLACK_BOT_TOKEN },
    github: { token: env.GH_TOKEN },
    claude: { oauthToken: env.CLAUDE_CODE_OAUTH_TOKEN },
    logLevel: env.LOG_LEVEL,
    workspaceDir: env.WORKSPACE_DIR,
    logsRetentionDays: env.LOGS_RETENTION_DAYS,
  };
}
