---
feature: slack-wesker-mvp
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-15
---
# Wesker MVP — Tasks

**For this plan:** `[[plan]]`

Each task is self-contained. Work in order; some depend on previous state. Every code task follows TDD where reasonable; container and doc tasks use smoke verification. Commits are **explicit steps** (never auto-batched) — requires user approval per project convention (global Rule 20).

---

## Phase 1: Discovery & Rename

### Task 0: Discovery — verify current versions and practices

**Files:**
- Create: `context/learnings/2026-04-15-discovery-findings.md`

**Purpose:** Before writing any code, confirm that the assumptions in the spec and plan are still valid in April 2026. Claude's knowledge cutoff is May 2025 — a year of drift. Anything that has materially changed (new SDK, deprecated flag, new LTS) gets captured here and, if significant, triggers a spec revision before code starts.

- [ ] **Step 1: Claude Code / Agent SDK**

Check, in order:

  1. Official Claude Code docs — look for the headless / `-p` invocation page. Confirm the exact flag names currently supported: prompt input (`-p`), system prompt (`--append-system-prompt` vs `--system-prompt` vs replaced by config file), output format (`--output-format stream-json` vs `json` vs removed), working directory (`--cwd`), tool allowlist (`--allowed-tools` or config).
  2. `npmjs.com` — search for `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/claude-code`. If a Node SDK with OAuth support is listed as stable, note version and whether it's preferable to subprocess-per-request.
  3. GitHub `anthropics/claude-code` — latest release notes and breaking changes since mid-2025.
  4. Check whether Claude Code now has a `server` or `daemon` mode (e.g., `claude server --port 3001`) that accepts requests over HTTP/stdio — would eliminate spawn overhead per request.

Record findings in `context/learnings/2026-04-15-discovery-findings.md` under a `## Claude Code / Agent SDK` heading. For each item, write the confirmed current approach and link to its doc.

- [ ] **Step 2: Slack Bolt (TypeScript) — Socket Mode**

Check:

  1. Current stable version of `@slack/bolt` on npm.
  2. Socket Mode instantiation pattern — what's the minimal, current boilerplate? (constructor options, event registration syntax for `app_mention` and DM `message`).
  3. Required Slack app scopes — confirm `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `users:read` are still the right set, and `connections:write` for App-Level Token.
  4. Known pitfalls — any advisory about retries, 3s ack window, duplicate events.

Record under `## Slack Bolt` heading with version + code skeleton.

- [ ] **Step 3: MCP ecosystem for Slack & GitHub**

Check:

  1. Is there an official or widely-adopted MCP Slack server (`@modelcontextprotocol/server-slack` or similar)? What does it expose — receive-events, send-messages, or both?
  2. Same for GitHub (`@modelcontextprotocol/server-github`).
  3. If either dramatically simplifies the design, note it. **Decision gate:** if an MCP Slack server offers push-style subscription (not just pull/call), we may defer writing `SlackChannel` entirely and let Claude handle both sides via MCP. Write your recommendation with evidence.

Record under `## MCP Servers` heading.

- [ ] **Step 4: `gh` CLI flags**

Run `gh repo list --help` (on your host machine if `gh` is installed; or check the official gh docs). Confirm:
  - `gh repo list <org> --json name,description --limit 100` still prints the expected JSON shape.
  - Any newer flag like `--visibility` or `--topic` worth knowing.
  - Auth via `GH_TOKEN` env var still works for the `repo list` subcommand with `read:org` scope.

Record under `## gh CLI` heading.

- [ ] **Step 5: Node LTS**

Check `nodejs.org/en/about/previous-releases`. Identify the current Active LTS (should be an even major number). If 24 is LTS, target 24; if 22 is still LTS, target 22. Record target under `## Node LTS` heading.

- [ ] **Step 6: Dockerfile best practices**

Check current guidance (Docker docs, node official image repo). Note:
  - Recommended base image tag for the Node LTS (e.g., `node:24-slim`, `node:24-bookworm-slim`).
  - Whether multi-stage is still the standard or if there's a newer pattern.
  - Non-root user recommendation — is running as `node` user expected now?

Record under `## Docker` heading.

- [ ] **Step 7: Decision gate**

Re-read the spec (`[[spec]]`) with the findings in hand. Ask: **does any finding invalidate a spec decision or success criterion?**

  - **No** → proceed to Task 1 as planned.
  - **Yes** → stop. Open discussion with Operator. Amend spec, re-run spec review, then return.

- [ ] **Step 8: Commit**

```bash
git add context/learnings/2026-04-15-discovery-findings.md
git commit -m "docs: record discovery findings for slack-wesker-mvp"
```

---

### Task 1: Rename Zerk → Wesker throughout the repo

**Files to modify:**
- `AGENTS.md`
- `context/constitution.md`
- `context/_index/home.md`
- `context/_index/specs.md`
- `context/_index/learnings.md`
- `context/_index/conventions.md`
- `context/_index/rules.md`

**Files to NOT modify:**
- `CLAUDE.md` (symlink to `AGENTS.md`, changes propagate automatically)
- `context/specs/0001-slack-wesker-mvp/spec.md` (already uses "Wesker"; do not touch historical spec language)
- `.git/**` (obviously)
- The working directory itself (`/Users/operator/www/agents/<redacted>/<redacted>/`) — Operator confirmed no local rename in this pass

- [ ] **Step 1: Find all occurrences**

```bash
grep -rn -E "\bZerk\b|\b<redacted>\b" \
  --include="*.md" \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude-dir=.claude \
  . | grep -v "^./context/specs/0001-slack-wesker-mvp/spec.md:"
```

Review the list. Decide on per-file edits: most occurrences replace with `Wesker` (capitalized) or `wesker` (lowercase, in paths/URLs).

- [ ] **Step 2: Update `AGENTS.md`**

Replace every "Zerk" with "Wesker". The file's opening paragraph should read:

```markdown
# Wesker — Agent Instructions

Wesker is a personal agent for Operator. This repository is Wesker's workspace — the place where its identity, capabilities, configuration, and operating knowledge live. Implementation is underway per `context/specs/0001-slack-wesker-mvp/`.
```

Leave everything else structurally identical; only the name changes.

- [ ] **Step 3: Update `context/constitution.md`**

Replace the `# Zerk — Constitution` heading with `# Wesker — Constitution`. Replace every other "Zerk" with "Wesker". Update the "Why … exists" section to reflect finalized decisions:

```markdown
## Why Wesker exists

Wesker is Operator's personal agent. This repository is its workspace — where its identity, configuration, and operating knowledge live. It runs as a Dockerized Node/TypeScript process on Operator's machine, connects to Slack via Socket Mode, and uses Claude Code (authenticated via OAuth) as its reasoning engine. The architecture is ports-and-adapters so additional message channels (Discord, Telegram) and agent backends (Codex, Gemini) can be added without changing the core.

The initial scope is deliberately minimal: one channel (Slack), one backend (Claude Code), zero custom tools. The first feature proves the end-to-end loop by answering "which repos exist in org X?" via `gh` CLI invoked from Claude's built-in Bash tool.
```

Update the "Architecture principles" and "Tooling and workflow principles" sections to stop saying "not yet decided" and instead list the locked-in decisions from the spec. Keep the safety rules (pushes, read-only DB, etc.) unchanged.

- [ ] **Step 4: Update the five `context/_index/*.md` files**

In each, replace "Zerk" with "Wesker" wherever it appears in headings and prose. This is mechanical — no structural changes.

- [ ] **Step 5: Verify no residual references**

```bash
grep -rn -E "\bZerk\b|\b<redacted>\b" \
  --include="*.md" \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude-dir=.claude \
  .
```

Expected: the only match is `context/specs/0001-slack-wesker-mvp/spec.md` (historical, untouched).

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md context/constitution.md context/_index/
git commit -m "chore: rename Zerk to Wesker throughout repo"
```

---

## Phase 2: Project Bootstrap

### Task 2: Node project init

**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `.nvmrc`, `.dockerignore`
- Modify: `.gitignore` (add Node artifacts + `.env`)

- [ ] **Step 1: `.nvmrc`**

Create with the Node major confirmed in Task 0 (e.g., `24`):

```
24
```

- [ ] **Step 2: `package.json`**

Create with:

```json
{
  "name": "wesker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@slack/bolt": "^<TASK-0-CONFIRMED>",
    "pino": "^<TASK-0-CONFIRMED>",
    "zod": "^<TASK-0-CONFIRMED>"
  },
  "devDependencies": {
    "@types/node": "^<TASK-0-CONFIRMED>",
    "tsx": "^<TASK-0-CONFIRMED>",
    "typescript": "^<TASK-0-CONFIRMED>",
    "vitest": "^<TASK-0-CONFIRMED>"
  }
}
```

Replace each `<TASK-0-CONFIRMED>` with versions confirmed in discovery findings. Then run `npm install` to generate the lockfile.

- [ ] **Step 3: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "types": ["node"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

- [ ] **Step 4: `.gitignore` update**

Append to existing `.gitignore`:

```gitignore

# Node
node_modules/
dist/

# Secrets
.env
.env.local

# Logs
*.log
```

- [ ] **Step 5: `.dockerignore`**

```gitignore
.git
node_modules
dist
.env
.env.local
*.log
context/
```

(`context/` is excluded because the container doesn't need the knowledge vault.)

- [ ] **Step 6: Verify TS compiles (empty project)**

```bash
mkdir -p src && echo 'export {}' > src/index.ts
npm run typecheck
```

Expected: no output, exit 0. Then remove the stub: `rm src/index.ts`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .nvmrc .gitignore .dockerignore
git commit -m "chore: init Node/TS project"
```

---

### Task 3: Config module

**Files:**
- Create: `src/config.ts`, `tests/config.test.ts`, `.env.example`, `src/logger.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { loadConfig } from "../src/config.js"

describe("loadConfig", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      SLACK_APP_TOKEN: "xapp-1-abc",
      SLACK_BOT_TOKEN: "xoxb-abc",
      GH_TOKEN: "ghp_abc",
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("loads valid config", () => {
    const cfg = loadConfig()
    expect(cfg.slack.appToken).toBe("xapp-1-abc")
    expect(cfg.slack.botToken).toBe("xoxb-abc")
    expect(cfg.github.token).toBe("ghp_abc")
  })

  it("throws with clear message on missing SLACK_APP_TOKEN", () => {
    delete process.env.SLACK_APP_TOKEN
    expect(() => loadConfig()).toThrow(/SLACK_APP_TOKEN/)
  })

  it("throws on malformed SLACK_APP_TOKEN prefix", () => {
    process.env.SLACK_APP_TOKEN = "not-a-valid-prefix"
    expect(() => loadConfig()).toThrow(/SLACK_APP_TOKEN/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: all three tests fail (module doesn't exist).

- [ ] **Step 3: Implement `src/config.ts`**

```ts
import { z } from "zod"

const schema = z.object({
  SLACK_APP_TOKEN: z.string().startsWith("xapp-"),
  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-"),
  GH_TOKEN: z.string().min(1),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  WORKSPACE_DIR: z.string().default("/workspace"),
})

export type Config = {
  slack: { appToken: string; botToken: string }
  github: { token: string }
  logLevel: "trace" | "debug" | "info" | "warn" | "error"
  workspaceDir: string
}

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")
    throw new Error(`Invalid environment: ${issues}`)
  }
  const e = parsed.data
  return {
    slack: { appToken: e.SLACK_APP_TOKEN, botToken: e.SLACK_BOT_TOKEN },
    github: { token: e.GH_TOKEN },
    logLevel: e.LOG_LEVEL,
    workspaceDir: e.WORKSPACE_DIR,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all three pass.

- [ ] **Step 5: Create `src/logger.ts`**

```ts
import pino from "pino"
import { loadConfig } from "./config.js"

export const logger = pino({
  level: loadConfig().logLevel,
  base: { service: "wesker" },
  timestamp: pino.stdTimeFunctions.isoTime,
})
```

- [ ] **Step 6: Create `.env.example`**

```
# Slack
SLACK_APP_TOKEN=xapp-1-REPLACE_ME
SLACK_BOT_TOKEN=xoxb-REPLACE_ME

# GitHub
GH_TOKEN=ghp_REPLACE_ME

# Runtime
LOG_LEVEL=info
WORKSPACE_DIR=/workspace
```

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/logger.ts tests/config.test.ts .env.example
git commit -m "feat(config): env loading with zod validation and pino logger"
```

---

## Phase 3: Core Types

### Task 4: Channel port

**Files:**
- Create: `src/channels/types.ts`

- [ ] **Step 1: Write `src/channels/types.ts`**

```ts
/**
 * A message source Wesker can listen to and reply on.
 * Implementations: SlackChannel (MVP), DiscordChannel (future), etc.
 */
export interface Channel {
  readonly name: string
  start(onMessage: MessageHandler): Promise<void>
  send(target: MessageTarget, text: string): Promise<void>
  react(target: MessageTarget, emoji: string): Promise<void>
  unreact(target: MessageTarget, emoji: string): Promise<void>
  stop(): Promise<void>
}

export type MessageHandler = (msg: IncomingMessage) => Promise<void>

export interface IncomingMessage {
  /** "slack", "discord", etc. */
  platform: string
  /** Platform-native user id */
  userId: string
  /** Platform-native channel/DM id */
  conversationId: string
  /** Thread id if inside a thread; null for top-level or DM */
  threadId: string | null
  /** Message text, with any bot-mention prefix already stripped */
  text: string
  /** Generated at ingress; used to correlate logs across layers */
  correlationId: string
  /** Opaque reference to the original event, so adapters can reply to it */
  messageRef: string
  /** Platform-specific raw event payload, for debugging only */
  raw: unknown
}

export interface MessageTarget {
  platform: string
  conversationId: string
  threadId: string | null
  messageRef?: string
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/channels/types.ts
git commit -m "feat(channels): define Channel port and message shapes"
```

---

### Task 5: Agent backend port

**Files:**
- Create: `src/agent/types.ts`

- [ ] **Step 1: Write `src/agent/types.ts`**

```ts
/**
 * A reasoning backend (LLM + tools) capable of answering a user message.
 * Implementations: ClaudeCodeBackend (MVP), CodexBackend (future), etc.
 */
export interface AgentBackend {
  readonly name: string
  query(input: AgentInput): Promise<AgentOutput>
}

export interface AgentInput {
  systemPrompt: string
  userMessage: string
  cwd: string
  correlationId: string
}

export interface AgentOutput {
  text: string
  toolCalls: ToolCallSummary[]
}

export interface ToolCallSummary {
  tool: string
  input: unknown
  /** Truncated stdout/result, for logging only */
  outputSnippet?: string
}

/**
 * Classified failure modes the core must distinguish.
 * Anything else becomes AgentBackendError with kind "unknown".
 */
export type AgentBackendErrorKind =
  | "auth_expired"       // Claude OAuth session needs re-login
  | "rate_limited"       // Plan limit hit
  | "timeout"            // Exceeded configured timeout
  | "unknown"            // Uncategorized failure

export class AgentBackendError extends Error {
  constructor(
    public readonly kind: AgentBackendErrorKind,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = "AgentBackendError"
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/agent/types.ts
git commit -m "feat(agent): define AgentBackend port and error kinds"
```

---

## Phase 4: Slack Adapter

### Task 6: Slack event normalization (pure function, TDD)

**Files:**
- Create: `src/channels/slack/normalize.ts`, `tests/channels/slack/normalize.test.ts`

The adapter relies on a pure function that converts Bolt event payloads into `IncomingMessage`. Extracting it lets us test without mocking Bolt.

- [ ] **Step 1: Write failing tests**

`tests/channels/slack/normalize.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { normalizeSlackEvent } from "../../../src/channels/slack/normalize.js"

const BOT_USER_ID = "UBOT"

describe("normalizeSlackEvent", () => {
  it("normalizes app_mention in a channel and strips the mention", () => {
    const raw = {
      type: "app_mention",
      user: "U1",
      channel: "C1",
      ts: "1710000000.000100",
      thread_ts: undefined,
      text: "<@UBOT> quais repos tem na octocat?",
    }
    const m = normalizeSlackEvent(raw, BOT_USER_ID)
    expect(m.platform).toBe("slack")
    expect(m.userId).toBe("U1")
    expect(m.conversationId).toBe("C1")
    expect(m.threadId).toBe("1710000000.000100") // root message becomes thread root
    expect(m.text).toBe("quais repos tem na octocat?")
    expect(m.messageRef).toBe("1710000000.000100")
    expect(m.correlationId).toMatch(/^[0-9a-f-]+$/)
  })

  it("preserves thread_ts when the mention is inside an existing thread", () => {
    const raw = {
      type: "app_mention",
      user: "U1",
      channel: "C1",
      ts: "1710000100.000200",
      thread_ts: "1710000000.000100",
      text: "<@UBOT> segue aqui",
    }
    const m = normalizeSlackEvent(raw, BOT_USER_ID)
    expect(m.threadId).toBe("1710000000.000100")
    expect(m.messageRef).toBe("1710000100.000200")
  })

  it("normalizes a direct message (channel_type=im), threadId is null", () => {
    const raw = {
      type: "message",
      channel_type: "im",
      user: "U1",
      channel: "D1",
      ts: "1710000000.000100",
      text: "oi",
    }
    const m = normalizeSlackEvent(raw, BOT_USER_ID)
    expect(m.threadId).toBeNull()
    expect(m.conversationId).toBe("D1")
    expect(m.text).toBe("oi")
  })

  it("returns null for bot messages (to avoid loops)", () => {
    const raw = {
      type: "message",
      channel_type: "channel",
      bot_id: "B123",
      user: "UBOT",
      channel: "C1",
      ts: "1710000000.000100",
      text: "echo",
    }
    expect(normalizeSlackEvent(raw, BOT_USER_ID)).toBeNull()
  })

  it("returns null for unsupported event shapes", () => {
    expect(normalizeSlackEvent({ type: "file_shared" }, BOT_USER_ID)).toBeNull()
  })
})
```

- [ ] **Step 2: Verify they fail**

```bash
npm test -- normalize
```

Expected: all five fail (module missing).

- [ ] **Step 3: Implement `src/channels/slack/normalize.ts`**

```ts
import { randomUUID } from "node:crypto"
import type { IncomingMessage } from "../types.js"

/**
 * Convert a Slack Bolt event payload into a normalized IncomingMessage.
 * Returns null for events we don't handle (bot messages, file shares, etc.).
 */
export function normalizeSlackEvent(
  raw: any,
  botUserId: string,
): IncomingMessage | null {
  if (!raw || typeof raw !== "object") return null

  // Ignore bot-authored messages to prevent loops
  if (raw.bot_id || raw.user === botUserId) return null

  const isMention = raw.type === "app_mention"
  const isDM = raw.type === "message" && raw.channel_type === "im"
  if (!isMention && !isDM) return null

  const userId: string | undefined = raw.user
  const conversationId: string | undefined = raw.channel
  const ts: string | undefined = raw.ts
  const threadTs: string | undefined = raw.thread_ts
  const rawText: string = typeof raw.text === "string" ? raw.text : ""

  if (!userId || !conversationId || !ts) return null

  // Strip leading bot mention (e.g. "<@UBOT> foo bar" -> "foo bar")
  const mentionPattern = new RegExp(`^\\s*<@${botUserId}>\\s*`)
  const text = rawText.replace(mentionPattern, "").trim()

  // threadId logic:
  //   - mention with thread_ts -> thread_ts (reply in that thread)
  //   - mention without thread_ts -> ts (start a thread using this message)
  //   - DM -> null (DMs don't have threads)
  let threadId: string | null
  if (isDM) {
    threadId = null
  } else {
    threadId = threadTs ?? ts
  }

  return {
    platform: "slack",
    userId,
    conversationId,
    threadId,
    text,
    correlationId: randomUUID(),
    messageRef: ts,
    raw,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- normalize
```

Expected: all five pass.

- [ ] **Step 5: Commit**

```bash
git add src/channels/slack/normalize.ts tests/channels/slack/normalize.test.ts
git commit -m "feat(slack): pure normalize function with unit tests"
```

---

### Task 7: Slack adapter (Bolt wiring)

**Files:**
- Create: `src/channels/slack/adapter.ts`

This is integration code around Bolt — it's not unit-tested here (Bolt is a third party and we'd be testing it, not our code). The pure `normalize` function is already tested; the adapter is otherwise a thin wrapper. Validation comes via the Phase 4 smoke step.

- [ ] **Step 1: Confirm the current Bolt Socket Mode pattern**

Open `context/learnings/2026-04-15-discovery-findings.md` (Task 0 output) and read the Slack Bolt section. The code below assumes the classic `new App({ ... socketMode: true, appToken, token })` pattern. If the current pattern diverges, adapt the code accordingly before writing the file.

- [ ] **Step 2: Implement `src/channels/slack/adapter.ts`**

```ts
import { App, LogLevel } from "@slack/bolt"
import type { Channel, IncomingMessage, MessageHandler, MessageTarget } from "../types.js"
import { normalizeSlackEvent } from "./normalize.js"
import { logger } from "../../logger.js"

export interface SlackChannelOptions {
  appToken: string
  botToken: string
}

export class SlackChannel implements Channel {
  readonly name = "slack"
  private app: App
  private botUserId: string | null = null
  private handler: MessageHandler | null = null

  constructor(private opts: SlackChannelOptions) {
    this.app = new App({
      token: opts.botToken,
      appToken: opts.appToken,
      socketMode: true,
      logLevel: LogLevel.WARN,
    })
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.handler = onMessage

    const auth = await this.app.client.auth.test({ token: this.opts.botToken })
    this.botUserId = (auth.user_id as string) ?? null
    if (!this.botUserId) {
      throw new Error("Slack auth.test did not return user_id")
    }

    const dispatch = async ({ event }: { event: any }) => {
      const msg = normalizeSlackEvent(event, this.botUserId!)
      if (!msg || !this.handler) return
      logger.info(
        { event: "message_received", platform: "slack", userId: msg.userId, correlationId: msg.correlationId },
        "slack message received",
      )
      try {
        await this.handler(msg)
      } catch (err) {
        logger.error(
          { event: "handler_error", correlationId: msg.correlationId, err: String(err) },
          "handler threw",
        )
      }
    }

    this.app.event("app_mention", dispatch)
    this.app.message(dispatch)

    await this.app.start()
    logger.info({ event: "slack_connected", botUserId: this.botUserId }, "Slack connected")
  }

  async send(target: MessageTarget, text: string): Promise<void> {
    if (target.platform !== "slack") throw new Error(`Unsupported platform: ${target.platform}`)
    await this.app.client.chat.postMessage({
      token: this.opts.botToken,
      channel: target.conversationId,
      thread_ts: target.threadId ?? undefined,
      text,
    })
  }

  async react(target: MessageTarget, emoji: string): Promise<void> {
    if (!target.messageRef) return
    try {
      await this.app.client.reactions.add({
        token: this.opts.botToken,
        channel: target.conversationId,
        timestamp: target.messageRef,
        name: emoji,
      })
    } catch (err: any) {
      if (err?.data?.error === "already_reacted") return
      throw err
    }
  }

  async unreact(target: MessageTarget, emoji: string): Promise<void> {
    if (!target.messageRef) return
    try {
      await this.app.client.reactions.remove({
        token: this.opts.botToken,
        channel: target.conversationId,
        timestamp: target.messageRef,
        name: emoji,
      })
    } catch (err: any) {
      if (err?.data?.error === "no_reaction") return
      throw err
    }
  }

  async stop(): Promise<void> {
    await this.app.stop()
    logger.info({ event: "slack_disconnected" }, "Slack disconnected")
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/channels/slack/adapter.ts
git commit -m "feat(slack): SlackChannel adapter over Bolt Socket Mode"
```

---

## Phase 5: Claude Code Backend

### Task 8: `ClaudeCodeBackend` (TDD for spawn args + error classification)

**Files:**
- Create: `src/agent/backends/claude-code.ts`, `tests/agent/backends/claude-code.test.ts`

**Assumption to verify first:** Invocation is `claude -p "<prompt>" --append-system-prompt "<sys>" --output-format stream-json --cwd <dir>` and output is newline-delimited JSON with terminal message containing final assistant text. If Task 0 findings say otherwise, adapt the code below before writing — the test structure remains valid.

- [ ] **Step 1: Write failing tests**

`tests/agent/backends/claude-code.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ChildProcess } from "node:child_process"
import { EventEmitter } from "node:events"
import { Readable, Writable } from "node:stream"

// We mock child_process.spawn before importing the module under test.
vi.mock("node:child_process", () => ({ spawn: vi.fn() }))

import { spawn } from "node:child_process"
import { ClaudeCodeBackend } from "../../../src/agent/backends/claude-code.js"
import { AgentBackendError } from "../../../src/agent/types.js"

function fakeProcess(stdoutLines: string[], stderr: string, exitCode: number): ChildProcess {
  const emitter = new EventEmitter() as any
  emitter.stdout = Readable.from(stdoutLines.map((l) => l + "\n"))
  emitter.stderr = Readable.from([stderr])
  emitter.stdin = new Writable({ write(_c, _e, cb) { cb() } })
  emitter.kill = vi.fn()
  setImmediate(() => emitter.emit("close", exitCode))
  return emitter
}

const base = {
  systemPrompt: "You are Wesker.",
  userMessage: "oi",
  cwd: "/workspace",
  correlationId: "test-cid",
}

beforeEach(() => vi.clearAllMocks())

describe("ClaudeCodeBackend", () => {
  it("spawns claude with the expected args", async () => {
    vi.mocked(spawn).mockReturnValue(
      fakeProcess([JSON.stringify({ type: "result", result: "hi" })], "", 0),
    )
    const backend = new ClaudeCodeBackend()
    await backend.query(base)
    expect(spawn).toHaveBeenCalledTimes(1)
    const [cmd, args] = vi.mocked(spawn).mock.calls[0]
    expect(cmd).toBe("claude")
    expect(args).toContain("-p")
    expect(args).toContain("--output-format")
    expect(args).toContain("stream-json")
  })

  it("returns the final assistant text from stream-json output", async () => {
    const stream = [
      JSON.stringify({ type: "system", subtype: "init" }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "partial" }] } }),
      JSON.stringify({ type: "result", result: "final answer" }),
    ]
    vi.mocked(spawn).mockReturnValue(fakeProcess(stream, "", 0))
    const backend = new ClaudeCodeBackend()
    const out = await backend.query(base)
    expect(out.text).toBe("final answer")
  })

  it("classifies auth_expired on specific stderr signal", async () => {
    vi.mocked(spawn).mockReturnValue(
      fakeProcess([], "Error: not authenticated. Run `claude /login`.", 1),
    )
    const backend = new ClaudeCodeBackend()
    await expect(backend.query(base)).rejects.toMatchObject({
      name: "AgentBackendError",
      kind: "auth_expired",
    })
  })

  it("classifies rate_limited on specific stderr signal", async () => {
    vi.mocked(spawn).mockReturnValue(
      fakeProcess([], "Error: usage limit reached for current billing period.", 1),
    )
    const backend = new ClaudeCodeBackend()
    await expect(backend.query(base)).rejects.toMatchObject({ kind: "rate_limited" })
  })

  it("wraps unknown failures as kind=unknown", async () => {
    vi.mocked(spawn).mockReturnValue(fakeProcess([], "segfault", 139))
    const backend = new ClaudeCodeBackend()
    await expect(backend.query(base)).rejects.toMatchObject({ kind: "unknown" })
  })
})
```

- [ ] **Step 2: Verify they fail**

```bash
npm test -- claude-code
```

Expected: all five fail (module missing).

- [ ] **Step 3: Implement `src/agent/backends/claude-code.ts`**

```ts
import { spawn } from "node:child_process"
import * as readline from "node:readline"
import type { AgentBackend, AgentInput, AgentOutput, ToolCallSummary } from "../types.js"
import { AgentBackendError } from "../types.js"
import { logger } from "../../logger.js"

export interface ClaudeCodeBackendOptions {
  /** Absolute path or command name. Defaults to `claude` (must be on PATH). */
  binary?: string
  /** Max wall-clock ms. Exceeding this kills the process and raises kind=timeout. */
  timeoutMs?: number
}

export class ClaudeCodeBackend implements AgentBackend {
  readonly name = "claude-code"
  private binary: string
  private timeoutMs: number

  constructor(opts: ClaudeCodeBackendOptions = {}) {
    this.binary = opts.binary ?? "claude"
    this.timeoutMs = opts.timeoutMs ?? 60_000
  }

  async query(input: AgentInput): Promise<AgentOutput> {
    const args = [
      "-p", input.userMessage,
      "--append-system-prompt", input.systemPrompt,
      "--output-format", "stream-json",
    ]

    logger.info(
      { event: "backend_started", backend: this.name, correlationId: input.correlationId },
      "spawning claude",
    )

    const proc = spawn(this.binary, args, { cwd: input.cwd })

    const stderrChunks: string[] = []
    proc.stderr?.on("data", (d) => stderrChunks.push(d.toString()))

    const toolCalls: ToolCallSummary[] = []
    let finalText = ""

    const rl = readline.createInterface({ input: proc.stdout!, crlfDelay: Infinity })
    const parsePromise = (async () => {
      for await (const line of rl) {
        if (!line.trim()) continue
        let evt: any
        try { evt = JSON.parse(line) } catch { continue }
        if (evt.type === "result" && typeof evt.result === "string") {
          finalText = evt.result
        } else if (evt.type === "assistant" && Array.isArray(evt.message?.content)) {
          for (const block of evt.message.content) {
            if (block.type === "tool_use") {
              toolCalls.push({ tool: block.name, input: block.input })
              logger.debug(
                { event: "backend_tool_call", tool: block.name, correlationId: input.correlationId },
                "tool call",
              )
            }
          }
        }
      }
    })()

    const timeout = setTimeout(() => proc.kill("SIGKILL"), this.timeoutMs)

    const exitCode: number | null = await new Promise((resolve) => {
      proc.once("close", (code) => resolve(code))
    })
    clearTimeout(timeout)
    await parsePromise

    const stderr = stderrChunks.join("")

    if (exitCode !== 0) {
      if (exitCode === null) {
        throw new AgentBackendError("timeout", `claude exceeded ${this.timeoutMs}ms`, { stderr })
      }
      if (/not authenticated|login/i.test(stderr)) {
        throw new AgentBackendError("auth_expired", "Claude Code OAuth session expired", { stderr })
      }
      if (/usage limit|rate limit|quota/i.test(stderr)) {
        throw new AgentBackendError("rate_limited", "Claude Code plan limit reached", { stderr })
      }
      throw new AgentBackendError("unknown", `claude exited ${exitCode}: ${stderr.slice(0, 400)}`, { stderr, exitCode })
    }

    logger.info(
      { event: "backend_completed", backend: this.name, correlationId: input.correlationId, toolCalls: toolCalls.length },
      "claude completed",
    )

    return { text: finalText || "(sem resposta)", toolCalls }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- claude-code
```

Expected: all five pass.

- [ ] **Step 5: Commit**

```bash
git add src/agent/backends/claude-code.ts tests/agent/backends/claude-code.test.ts
git commit -m "feat(agent): ClaudeCodeBackend with typed errors"
```

---

### Task 9: System prompt

**Files:**
- Create: `src/agent/system-prompt.ts`

- [ ] **Step 1: Write the system prompt**

`src/agent/system-prompt.ts`:

```ts
export const WESKER_SYSTEM_PROMPT = `
You are Wesker, Operator's personal agent. Your workspace is the Docker container you run in. The repository that hosts you is github.com/octocat/wesker.

# Language
Reply in Brazilian Portuguese by default. Switch only if the user writes in another language.

# Tone
Direct, practical, minimal fluff. Light humor is ok (Resident Evil references included). Keep replies short. Use Slack markdown — code blocks for commands/output, **bold** for emphasis. Avoid large tables.

# Environment
You have access to the Bash tool inside a Linux container with:
  • gh CLI, already authenticated via GH_TOKEN (scopes: repo, read:org)
  • git, node 24, npm, curl, jq
  • /workspace is where you can clone repos and work; it's a persistent volume

For GitHub operations, prefer \`gh\` with --json flags for structured output. Example:
  \`gh repo list octocat --json name,description --limit 100\`

# Safety rules
Do not run — without asking the user first — any of:
  • rm -rf outside /workspace
  • git push --force
  • gh repo delete, gh pr merge
  • Any command touching shared resources (deploys, databases, external APIs with side effects)

Never echo the content of GH_TOKEN, ANTHROPIC_API_KEY, or any variable whose name contains TOKEN, KEY, or SECRET. Never send file contents from the host to external URLs.

# Behavior
If you can't do something, explain why clearly (e.g., "your PAT doesn't have read:org for that org").
If you need clarification, ask in ONE sentence.
Do not speculate — confirm the goal before starting anything that takes time.
`.trim()
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/system-prompt.ts
git commit -m "feat(agent): add Wesker system prompt"
```

---

## Phase 6: Agent Core & Entry Point

### Task 10: `AgentCore` orchestrator

**Files:**
- Create: `src/agent/core.ts`

This is glue — it ties `IncomingMessage` to `AgentBackend.query` and back. The pieces it orchestrates are all tested; the glue is verified in the Phase 8 smoke test.

- [ ] **Step 1: Implement `src/agent/core.ts`**

```ts
import type { Channel, IncomingMessage, MessageTarget } from "../channels/types.js"
import { AgentBackendError, type AgentBackend } from "./types.js"
import { WESKER_SYSTEM_PROMPT } from "./system-prompt.js"
import { logger } from "../logger.js"

export interface AgentCoreOptions {
  backend: AgentBackend
  workspaceDir: string
}

export class AgentCore {
  constructor(private opts: AgentCoreOptions) {}

  /**
   * Binds the core to a channel. The channel calls back with IncomingMessage;
   * core runs the backend and replies through the same channel.
   */
  bind(channel: Channel): (msg: IncomingMessage) => Promise<void> {
    return async (msg: IncomingMessage) => {
      const target: MessageTarget = {
        platform: msg.platform,
        conversationId: msg.conversationId,
        threadId: msg.threadId,
        messageRef: msg.messageRef,
      }

      await safe(() => channel.react(target, "eyes"))

      try {
        const out = await this.opts.backend.query({
          systemPrompt: WESKER_SYSTEM_PROMPT,
          userMessage: msg.text,
          cwd: this.opts.workspaceDir,
          correlationId: msg.correlationId,
        })

        await channel.send(target, out.text)
        await safe(() => channel.unreact(target, "eyes"))
        await safe(() => channel.react(target, "white_check_mark"))

        logger.info(
          { event: "response_sent", correlationId: msg.correlationId },
          "response sent",
        )
      } catch (err) {
        const reply = translateError(err)
        await channel.send(target, reply)
        await safe(() => channel.unreact(target, "eyes"))
        await safe(() => channel.react(target, "warning"))

        logger.error(
          { event: "handler_failed", correlationId: msg.correlationId, err: String(err) },
          "core handler failed",
        )
      }
    }
  }
}

async function safe(fn: () => Promise<unknown>): Promise<void> {
  try { await fn() } catch { /* swallow — non-critical reaction ops */ }
}

function translateError(err: unknown): string {
  if (err instanceof AgentBackendError) {
    switch (err.kind) {
      case "auth_expired":
        return "minha sessão Claude expirou. Roda `docker compose run --rm wesker claude /login` pra me reautenticar."
      case "rate_limited":
        return "bati o limite do plano Claude. Tenta daqui a pouco."
      case "timeout":
        return "demorei demais pra responder. Tenta simplificar a pergunta?"
      case "unknown":
      default:
        return "deu ruim aqui dentro. Olha os logs pra detalhes."
    }
  }
  return "deu ruim aqui dentro. Olha os logs pra detalhes."
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/agent/core.ts
git commit -m "feat(agent): AgentCore wiring channel ↔ backend with error translation"
```

---

### Task 11: Entry point with boot-time health checks

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement `src/index.ts`**

```ts
import { spawn } from "node:child_process"
import { loadConfig } from "./config.js"
import { logger } from "./logger.js"
import { SlackChannel } from "./channels/slack/adapter.js"
import { ClaudeCodeBackend } from "./agent/backends/claude-code.js"
import { AgentCore } from "./agent/core.js"

async function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env } })
    let out = "", err = ""
    p.stdout?.on("data", (d) => (out += d.toString()))
    p.stderr?.on("data", (d) => (err += d.toString()))
    p.on("close", (code) => resolve({ code, out, err }))
  })
}

async function healthChecks(config: ReturnType<typeof loadConfig>): Promise<void> {
  // 1. gh CLI authenticated
  const gh = await run("gh", ["auth", "status"], { GH_TOKEN: config.github.token })
  if (gh.code !== 0) {
    throw new Error(`gh auth failed: ${gh.err.slice(0, 200)}`)
  }
  logger.info({ event: "github_auth_ok" }, "gh CLI authenticated")

  // 2. claude CLI available
  const cc = await run("claude", ["--version"])
  if (cc.code !== 0) {
    throw new Error(`claude --version failed: ${cc.err.slice(0, 200)}`)
  }
  logger.info({ event: "claude_ok", version: cc.out.trim() }, "claude CLI available")
}

async function main() {
  const config = loadConfig()
  logger.info({ event: "boot_start" }, "Wesker booting")

  await healthChecks(config)

  const backend = new ClaudeCodeBackend()
  const core = new AgentCore({ backend, workspaceDir: config.workspaceDir })

  const slack = new SlackChannel(config.slack)
  await slack.start(core.bind(slack))

  logger.info({ event: "wesker_online" }, "Wesker online")

  const shutdown = async (signal: string) => {
    logger.info({ event: "shutdown", signal }, "shutting down")
    try { await slack.stop() } catch {}
    process.exit(0)
  }
  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch((err) => {
  logger.fatal({ event: "boot_failed", err: String(err) }, "boot failed")
  process.exit(1)
})
```

- [ ] **Step 2: Typecheck and build**

```bash
npm run typecheck
npm run build
```

Expected: both pass; `dist/` is populated.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: composition root with boot-time health checks"
```

---

## Phase 7: Container

### Task 12: Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Write `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production

# OS deps: git, gh, curl, jq, bash
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates gnupg jq bash \
 && rm -rf /var/lib/apt/lists/*

# gh CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# Claude Code via official installer
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Directories for persistence (mounted as volumes in compose)
RUN mkdir -p /workspace /root/.claude
VOLUME ["/workspace", "/root/.claude"]

CMD ["node", "dist/index.js"]
```

Replace `node:24-slim` with the Node LTS confirmed in Task 0 if it differs.

- [ ] **Step 2: Build the image**

```bash
docker build -t wesker:dev .
```

Expected: succeeds. Note the final image size (`docker images wesker:dev`); should be roughly 500–800MB.

- [ ] **Step 3: Smoke-check the built image**

```bash
docker run --rm wesker:dev bash -c "node --version && gh --version && claude --version && git --version"
```

Expected: all four tools print versions.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "feat: multi-stage Dockerfile with gh, git, claude preinstalled"
```

---

### Task 13: docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  wesker:
    build: .
    image: wesker:dev
    container_name: wesker
    env_file: .env
    volumes:
      - claude-home:/root/.claude
      - workspace:/workspace
    restart: unless-stopped
    stdin_open: true
    tty: true

volumes:
  claude-home:
  workspace:
```

`stdin_open` + `tty` are required so `docker compose run --rm wesker claude /login` can run interactively.

- [ ] **Step 2: Validate compose file**

```bash
docker compose config
```

Expected: prints the resolved config without error.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: docker-compose service with OAuth and workspace volumes"
```

---

## Phase 8: Docs & Smoke

### Task 14: README and SMOKE docs

**Files:**
- Create: `README.md`, `SMOKE.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Wesker

Personal agent. Runs in Docker on your machine, listens to Slack via Socket Mode, answers using Claude Code (OAuth).

## Prerequisites

- Docker and Docker Compose
- A Slack App with Socket Mode enabled (scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `users:read`, `reactions:write` + `connections:write` for the App-Level token)
- A GitHub PAT with `repo` + `read:org`
- A Claude Code account (Max/Pro plan recommended)

## Setup

1. Clone the repo and copy the env template:

   \`\`\`bash
   cp .env.example .env
   \`\`\`

   Fill in \`SLACK_APP_TOKEN\` (\`xapp-…\`), \`SLACK_BOT_TOKEN\` (\`xoxb-…\`), and \`GH_TOKEN\` (\`ghp_…\`).

2. Build the image:

   \`\`\`bash
   docker compose build
   \`\`\`

3. Run the Claude Code login flow (first time, and whenever the session expires):

   \`\`\`bash
   docker compose run --rm wesker claude /login
   \`\`\`

   Follow the URL printed in the terminal, complete OAuth in your browser, return. The session persists in the \`claude-home\` Docker volume.

4. Start Wesker:

   \`\`\`bash
   docker compose up -d
   docker compose logs -f wesker
   \`\`\`

   Watch for the \`wesker_online\` log event.

## Usage

Mention the bot in any Slack channel where it's invited:

> @wesker quais repos tem na octocat?

Or DM it directly.

## Performance

The spec targets ~30 seconds end-to-end for the happy path — this is a **warm-path** target, not a guarantee. Cold-start responses (first mention after container restart or a full rebuild) may take 45–60 seconds as Claude Code initializes its session and tools.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "minha sessão Claude expirou" | Run \`docker compose run --rm wesker claude /login\` |
| Container exits with "Invalid environment" | Check \`.env\` — all three \`SLACK_*\`/\`GH_TOKEN\` variables must be set |
| Bot doesn't react to mentions | Verify the Socket Mode connection in the Slack app config; check logs for \`slack_connected\` |
| "não tenho acesso à org X" | Your PAT needs \`read:org\` and, for SAML SSO orgs, must be authorized for that org in GitHub settings |

## Architecture

See \`context/specs/0001-slack-wesker-mvp/\` for the full spec, plan, and task breakdown. Briefly:

- **Channels** (\`src/channels/\`) — pluggable message sources. Slack is MVP; Discord/Telegram are future.
- **Agent Core** (\`src/agent/core.ts\`) — wires a channel to a backend. Channel-agnostic and backend-agnostic.
- **Agent Backends** (\`src/agent/backends/\`) — pluggable reasoning engines. Claude Code is MVP; Codex/Gemini future.
- **Tools** — none. Wesker uses Claude Code's built-in tools (Bash etc.) directly. GitHub queries go via the \`gh\` CLI inside the container.
```

- [ ] **Step 2: Write `SMOKE.md`**

```markdown
# Wesker — Smoke Test Checklist

Run this after any change that touches container setup, authentication, or the Slack/backend plumbing.

## Pre-flight

- [ ] \`.env\` has \`SLACK_APP_TOKEN\`, \`SLACK_BOT_TOKEN\`, \`GH_TOKEN\` set
- [ ] Wesker bot has been invited to at least one Slack channel you test in
- [ ] \`docker compose run --rm wesker claude /login\` completed successfully (or was previously completed and still valid)

## Boot

- [ ] \`docker compose up -d\` starts without error
- [ ] \`docker compose logs wesker\` shows \`github_auth_ok\`
- [ ] Logs show \`claude_ok\` with a version string
- [ ] Logs show \`slack_connected\` with a \`botUserId\`
- [ ] Logs show \`wesker_online\`

## Happy path (Spec S1)

- [ ] Mention \`@wesker quais repos tem na octocat?\` in a channel
- [ ] Eyes reaction appears on your message within ~2 seconds
- [ ] A reply lands in the same thread within ~30 seconds
- [ ] Reply is in Portuguese (PT-BR)
- [ ] Reply lists repos correctly (cross-check with \`gh repo list octocat\` locally)
- [ ] Eyes reaction is removed and replaced with \`:white_check_mark:\`

## DM path (Spec S2)

- [ ] Send \`oi\` as a DM to the Wesker bot
- [ ] Reply arrives in the DM (not in a thread, \`thread_ts\` is null)
- [ ] Reply is in Portuguese

## Org without access (Spec S3)

- [ ] Mention \`@wesker quais repos tem na SomeOrgYouCantSee?\`
- [ ] Reply explains in plain language that there's no access
- [ ] Reply does not include raw stderr or mention the word "GH_TOKEN"

## Off-topic (Spec S4)

- [ ] Mention \`@wesker qual a capital do Peru?\`
- [ ] Reply: "Lima" (or equivalent), no tool call in logs (\`backend_tool_call\` absent)

## Auth expired simulation (Spec S5)

- [ ] \`docker compose exec wesker rm -rf /root/.claude/sessions\` (or whatever location OAuth session is stored — confirm in Task 0 findings)
- [ ] Mention \`@wesker oi\`
- [ ] Reply instructs to run \`docker compose run --rm wesker claude /login\`
- [ ] Warning-level log includes \`auth_expired\`
- [ ] Restore by running \`/login\` again
```

- [ ] **Step 3: Commit**

```bash
git add README.md SMOKE.md
git commit -m "docs: README setup guide and SMOKE checklist"
```

---

### Task 15: Execute the smoke test

**Files:** none (verification only)

- [ ] **Step 1: Build fresh from clean state**

```bash
docker compose down --volumes  # WARNING: wipes claude-home; confirm with Operator before running on a live install
docker compose build --no-cache
```

- [ ] **Step 2: Create `.env` from example and populate real tokens**

- [ ] **Step 3: Run `/login`**

```bash
docker compose run --rm wesker claude /login
```

Follow the browser flow.

- [ ] **Step 4: Start the stack**

```bash
docker compose up -d
docker compose logs -f wesker
```

Verify boot logs match the "Boot" section of `SMOKE.md`.

- [ ] **Step 5: Walk through `SMOKE.md` checklist**

Mark each item as passed or file a bug. Do not mark this task complete until every item in `SMOKE.md` passes.

- [ ] **Step 6: Mark spec as shipped**

Edit `context/specs/0001-slack-wesker-mvp/spec.md` frontmatter:

```yaml
---
status: shipped
feature: slack-wesker-mvp
created: 2026-04-15
shipped: <YYYY-MM-DD>
---
```

Update `context/_index/specs.md`: move the "0001-slack-wesker-mvp" bullet from "Active" to "Shipped" with the ship date.

- [ ] **Step 7: Commit**

```bash
git add context/specs/0001-slack-wesker-mvp/spec.md context/_index/specs.md
git commit -m "chore: mark slack-wesker-mvp shipped"
```

- [ ] **Step 8: Post-mortem notes**

If anything surprised you during implementation — a gotcha, a constraint, a surprising behavior — add an atomic note to `context/learnings/` using `context/templates/learning.md`. Link it to this spec with a wikilink. This is part of the project's standard after-work practice (see `AGENTS.md`).
