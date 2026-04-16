import type { Handler } from '@/commands/dispatcher';

export function buildRestartHandler(exit: (code: number) => void): Handler {
  return async () => {
    // Give the finish() write a tick to flush before exit
    setTimeout(() => exit(0), 50);
    return { ok: true, data: { restartingIn: '50ms' } };
  };
}
