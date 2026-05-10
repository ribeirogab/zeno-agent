import { createLogger } from '@zeno/logger';
import type { AgentBackend, AgentInput, AgentOutput } from '@/agent/types';

const logger = createLogger({ service: 'worker' });

export interface Fixture {
  /** RegExp tested against the (slack-context-stripped) user message. First match wins. */
  match: RegExp;
  /** Reply text returned verbatim when the pattern matches. */
  reply: string;
}

/**
 * In-memory backend that returns canned replies. Selected via the runtime
 * DB (`backend_settings.active_backend_id = 'mock'`) — set by the E2E fixture
 * `tests/e2e/fixtures/mock-backend.ts`. Spec 0072 dropped the legacy
 * ZENO_BACKEND=mock env path.
 *
 * Free, instant, deterministic — useful for dev iteration on Slack/core/runner without burning Claude.
 */
export class MockBackend implements AgentBackend {
  readonly name = 'mock';
  private counter = 0;

  constructor(private readonly fixtures: Fixture[] = []) {}

  query(input: AgentInput): Promise<AgentOutput> {
    const userMessage = stripSlackContext(input.userMessage);
    const matched = this.fixtures.find((f) => f.match.test(userMessage));
    const text = matched?.reply ?? defaultEcho(userMessage);
    const sessionId = input.resumeSessionId ?? `mock-sess-${++this.counter}`;
    logger.info(
      {
        event: 'mock_backend_reply',
        correlationId: input.correlationId,
        matched: matched ? matched.match.source : null,
        sessionId,
      },
      'mock backend reply',
    );
    return Promise.resolve({ text, toolCalls: [], sessionId });
  }
}

function defaultEcho(userMessage: string): string {
  const trimmed = userMessage.trim().slice(0, 200);
  return `[mock] você disse: "${trimmed}"`;
}

/**
 * AgentCore prepends a [slack_context]...[/slack_context] block before the user text.
 * The mock is for human-readable iteration, so strip it before matching/echoing.
 */
function stripSlackContext(userMessage: string): string {
  return userMessage.replace(/^\[slack_context\][\s\S]*?\[\/slack_context\]\s*/m, '').trim();
}
