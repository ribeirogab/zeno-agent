import { ApiError } from '@/lib/api-client';

export function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    if (typeof err.body === 'object' && err.body && 'error' in err.body) {
      const e = (err.body as { error: unknown }).error;
      if (typeof e === 'string') return e;
    }
    return `erro ${err.status}`;
  }
  return err instanceof Error ? err.message : 'erro desconhecido';
}
