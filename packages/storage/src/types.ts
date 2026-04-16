export interface Session {
  threadId: string;
  sessionId: string;
  createdAt: string;
  lastUsedAt: string;
}

export type CronSource = 'static' | 'chat';
// CronRunStatus is consumed by CronRunRepo's finish(); exported for callers (cron runner, dashboard) in later specs.
export type CronRunStatus = 'running' | 'success' | 'failed' | 'skipped';

export interface Cron {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  schedule: string;
  enabled: boolean;
  source: CronSource;
  createdBy: string | null;
  notifyConversationId: string | null;
  notifyThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface CreateCronInput {
  id?: string;
  name: string;
  description?: string | null;
  prompt: string;
  schedule: string;
  enabled?: boolean;
  source: CronSource;
  createdBy?: string | null;
  notifyConversationId?: string | null;
  notifyThreadId?: string | null;
  nextRunAt?: string | null;
}

export interface UpdateCronInput {
  name?: string;
  description?: string | null;
  prompt?: string;
  schedule?: string;
  enabled?: boolean;
  notifyConversationId?: string | null;
  notifyThreadId?: string | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
}

export interface CronRun {
  id: string;
  cronId: string;
  startedAt: string;
  finishedAt: string | null;
  status: CronRunStatus;
  output: string | null;
  error: string | null;
}
