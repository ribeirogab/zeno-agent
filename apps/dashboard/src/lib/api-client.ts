export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`api ${status}`);
    this.name = 'ApiError';
  }
}

const CSRF_COOKIE = 'zeno_csrf';
const CSRF_HEADER = 'X-CSRF-Token';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCsrfCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split('; ')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq) === CSRF_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return undefined;
}

/**
 * CSRF header for raw `fetch` callers that can't use `apiFetch` (e.g. multipart
 * uploads, text/plain bodies, fire-and-forget). Returns an empty object on GET/HEAD
 * and when no `zeno_csrf` cookie is set; spread it into the `headers` field.
 */
export function csrfHeaders(method: string): Record<string, string> {
  if (!MUTATING.has(method.toUpperCase())) return {};
  const token = readCsrfCookie();
  return token ? { [CSRF_HEADER]: token } : {};
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders(method),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
