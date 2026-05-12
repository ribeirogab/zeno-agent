/**
 * Spec 2026-05-11 (channels CLI-first): registry of channel-probe strategies.
 *
 * Each catalog entry declares a `testStrategy` string (e.g. `'slack_auth_test'`).
 * `runTestStrategy(strategy, ctx)` looks up the matching probe, runs it with a 5 s
 * hard deadline, and returns a uniform `{ status, latencyMs, error? }` result.
 *
 * Strategies are intentionally side-effect-free at the wire level (they call
 * upstream APIs; they do not spawn adapters or touch the worker process). The
 * route handler in `channels.ts` writes `lastVerifiedAt` / `lastError` on the
 * connector row after the result comes back.
 */

export interface TestResult {
  status: 'passed' | 'failed';
  latencyMs: number;
  error?: 'auth_failed' | 'timeout' | 'not_implemented' | 'network' | 'unknown';
}

/**
 * Inputs available to every probe strategy. Decrypted secrets are passed by the
 * caller (the API route handler). We accept the full bag here even though a given
 * probe only reads a subset — keeps the registry signature uniform across future
 * channels (Discord/Telegram/WhatsApp) without per-strategy interface variance.
 */
export interface TestContext {
  /** Decrypted catalog field values, keyed by field.key. Empty when adapter has no secrets. */
  fields: Record<string, string>;
  /** Custom fetch — tests inject a mock. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

const TIMEOUT_MS = 5000;

type ProbeHandler = (ctx: TestContext) => Promise<Omit<TestResult, 'latencyMs'>>;

/**
 * `slack_auth_test`: hits Slack's `auth.test` endpoint with the configured bot
 * token. No bolt App boot — direct HTTP, so the probe is cheap and never
 * conflicts with the running adapter.
 */
const slackAuthTest: ProbeHandler = async (ctx) => {
  const botToken = ctx.fields.SLACK_BOT_TOKEN;
  if (!botToken) return { status: 'failed', error: 'auth_failed' };
  const f = ctx.fetchImpl ?? fetch;
  try {
    const res = await f('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    return body.ok ? { status: 'passed' } : { status: 'failed', error: 'auth_failed' };
  } catch {
    return { status: 'failed', error: 'network' };
  }
};

const STRATEGIES: Record<string, ProbeHandler> = {
  slack_auth_test: slackAuthTest,
};

export async function runTestStrategy(strategy: string, ctx: TestContext): Promise<TestResult> {
  const handler = STRATEGIES[strategy];
  const start = Date.now();
  if (!handler) {
    return { status: 'failed', latencyMs: 0, error: 'not_implemented' };
  }
  const timeout = new Promise<Omit<TestResult, 'latencyMs'>>((resolve) =>
    setTimeout(() => resolve({ status: 'failed', error: 'timeout' }), TIMEOUT_MS),
  );
  const result = await Promise.race([handler(ctx), timeout]);
  return { ...result, latencyMs: Date.now() - start };
}
