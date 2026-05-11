/**
 * Spec 0071 — verify a Claude OAuth token by calling the Anthropic API once.
 *
 * Used by:
 *   - POST /api/backends/:id/credentials (paste-token path) — before saving.
 *   - GET  /api/backends/:id/oauth/:session/stream — after the CLI captures
 *     the token, before persisting.
 *
 * Cheapest possible request: model=`claude-haiku-4-5`, max_tokens=1, single
 * digit prompt. Result is classified into:
 *   - ok            → token works, save with status='active'
 *   - unauthorized  → 401, NOT saved (paste flow returns INVALID, OAuth flow
 *                     returns CLI/UNAUTHORIZED variant)
 *   - rate_limited  → 429, NOT saved (token may be valid; we just can't tell)
 *   - network       → 5xx / DNS / connection error — caller decides whether
 *                     to save with status='untested' or fail
 */

export type ClaudeTestResult =
  | { kind: 'ok' }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited'; retryAfterSec?: number }
  | { kind: 'network'; reason: string };

export interface ClaudeTestOpts {
  token: string;
  model: string;
  /** Optional injection point for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export async function testClaudeToken(opts: ClaudeTestOpts): Promise<ClaudeTestResult> {
  const fetchFn = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        // Anthropic accepts the OAuth token in `authorization: Bearer …` for
        // Claude Code subscription tokens (sk-ant-oat…). For a flat API key
        // (sk-ant-api…) the header would be `x-api-key`. Spec 0071 only
        // supports the OAuth subscription path today.
        authorization: `Bearer ${opts.token}`,
        'anthropic-version': '2023-06-01',
        // OAuth subscription tokens require this beta header on /v1/messages —
        // without it Anthropic returns 401 even for valid tokens. Verified
        // empirically against api.anthropic.com on 2026-05-04: same token,
        // no beta header → 401; with beta header → 200.
        'anthropic-beta': 'oauth-2025-04-20',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: '1' }],
      }),
    });
    if (res.status === 401 || res.status === 403) return { kind: 'unauthorized' };
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '');
      const result: ClaudeTestResult = { kind: 'rate_limited' };
      if (Number.isFinite(retry)) result.retryAfterSec = retry;
      return result;
    }
    if (res.status >= 500) return { kind: 'network', reason: `anthropic ${res.status}` };
    if (!res.ok) return { kind: 'network', reason: `unexpected ${res.status}` };
    return { kind: 'ok' };
  } catch (err) {
    return {
      kind: 'network',
      reason: String((err as Error).message ?? err).slice(0, 200),
    };
  }
}
