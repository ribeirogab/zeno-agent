import type { ApiClient } from './api-client.js';

export interface CommandStatus {
  correlationId: string;
  type: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  result: string | null;
  completedAt: string | null;
}

const TERMINAL: ReadonlySet<CommandStatus['status']> = new Set(['success', 'failed']);

export async function waitForCommand(
  client: Pick<ApiClient, 'get'>,
  correlationId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<CommandStatus> {
  const interval = opts.intervalMs ?? 500;
  const timeout = opts.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const status = await client.get<CommandStatus>(`/api/commands/${correlationId}`);
    if (TERMINAL.has(status.status)) return status;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`timeout after ${timeout}ms waiting for command ${correlationId}`);
}
