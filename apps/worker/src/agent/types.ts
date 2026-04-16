/**
 * A reasoning backend (LLM + tools) capable of answering a user message.
 * Implementations: ClaudeCodeBackend (MVP), CodexBackend (future), etc.
 */
export interface AgentBackend {
  readonly name: string;
  query(input: AgentInput): Promise<AgentOutput>;
}

export interface AgentInput {
  systemPrompt: string;
  userMessage: string;
  cwd: string;
  correlationId: string;
  /** Set to false to disable session persistence (stateless DMs). Undefined/true = default SDK behavior (persist). */
  persistSession?: boolean;
  /** When provided, resume the given session instead of starting a new one. */
  resumeSessionId?: string;
}

export interface AgentOutput {
  text: string;
  toolCalls: ToolCallSummary[];
  /** Session id from the SDK result — used by AgentCore to map Slack threads to SDK sessions. */
  sessionId?: string;
}

export interface ToolCallSummary {
  tool: string;
  input: unknown;
  /** Truncated stdout/result, for logging only */
  outputSnippet?: string;
}

/**
 * Classified failure modes the core must distinguish.
 * Anything else becomes AgentBackendError with kind 'unknown'.
 */
type AgentBackendErrorKind =
  | 'auth_expired' // Claude OAuth session needs re-login
  | 'rate_limited' // Plan limit hit
  | 'timeout' // Exceeded configured timeout
  | 'unknown'; // Uncategorized failure

export class AgentBackendError extends Error {
  constructor(
    public readonly kind: AgentBackendErrorKind,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AgentBackendError';
  }
}
