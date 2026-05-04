import { z } from 'zod';

const HEX_64 = /^[0-9a-fA-F]{64}$/;

const schema = z.object({
  DASHBOARD_PASSWORD: z.string().min(1),
  DASHBOARD_SESSION_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  WORKSPACE_DIR: z.string().default('/workspace'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Spec 0071: shared with worker. 32-byte hex master key for envelope
  // encryption of all DB credentials. Required at boot.
  ZENO_MASTER_KEY: z.string().regex(HEX_64, 'ZENO_MASTER_KEY must be 64 hex chars (32 bytes)'),
  // Spec 0050: profile id is set by infra/docker.sh from the compose file.
  ZENO_PROFILE: z.string().min(1).default('default'),
});

export type ApiConfig = {
  password: string;
  sessionSecret: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  workspaceDir: string;
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  masterKey: Buffer;
  profileId: string;
};

export function loadApiConfig(): ApiConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment for api: ${issues}`);
  }
  const env = parsed.data;
  return {
    password: env.DASHBOARD_PASSWORD,
    sessionSecret: env.DASHBOARD_SESSION_SECRET,
    logLevel: env.LOG_LEVEL,
    workspaceDir: env.WORKSPACE_DIR,
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    masterKey: Buffer.from(env.ZENO_MASTER_KEY, 'hex'),
    profileId: env.ZENO_PROFILE,
  };
}
