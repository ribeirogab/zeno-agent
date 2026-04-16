---
feature: slack-zeno-mvp
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-15
---
# Zeno MVP — Tasks

**For this plan:** `[[plan]]`

Each task is self-contained. Work in order; some depend on previous state. Every code task follows TDD where reasonable; container and doc tasks use smoke verification. Commits are **explicit steps** (never auto-batched) — requires user approval per project convention (global Rule 20).

---

## Phase 1: Discovery & Rename

### Task 0: Discovery — verify current versions and practices

**Files:**
- Create one **atomic learning note per topic** in `context/learnings/` (not a single combined file). Use `context/templates/learning.md` as the template.
- Update: `context/_index/learnings.md` — add each new note under its tag section (`#reference` for CLI/API/version facts, `#concept` for architectural patterns, `#gotcha` for surprises).

**Note naming:** kebab-case descriptive, e.g. `claude-code-headless-cli.md`, `claude-agent-sdk-node.md`, `slack-bolt-socket-mode.md`, `mcp-slack-server.md`, `gh-repo-list-json.md`, `node-lts-current.md`, `docker-node-slim-best-practices.md`. One note per finding keeps them reusable beyond this spec and enables Obsidian backlinks.

**Frontmatter:** include `related: ["[[../specs/0001-slack-zeno-mvp/spec]]"]` so each note backlinks to this spec.

**Purpose:** Before writing any code, confirm that the assumptions in the spec and plan are still valid in April 2026. Claude's knowledge cutoff is May 2025 — a year of drift. Anything that has materially changed (new SDK, deprecated flag, new LTS) is captured as a learning note and, if significant, triggers a spec revision before code starts.

- [ ] **Step 1: Claude Code / Agent SDK**

Check, in order:

  1. Official Claude Code docs — look for the headless / `-p` invocation page. Confirm the exact flag names currently supported: prompt input (`-p`), system prompt (`--append-system-prompt` vs `--system-prompt` vs replaced by config file), output format (`--output-format stream-json` vs `json` vs removed), working directory (`--cwd`), tool allowlist (`--allowed-tools` or config).
  2. `npmjs.com` — search for `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/claude-code`. If a Node SDK with OAuth support is listed as stable, note version and whether it's preferable to subprocess-per-request.
  3. GitHub `anthropics/claude-code` — latest release notes and breaking changes since mid-2025.
  4. Check whether Claude Code now has a `server` or `daemon` mode (e.g., `claude server --port 3001`) that accepts requests over HTTP/stdio — would eliminate spawn overhead per request.

Produce notes: `context/learnings/claude-code-headless-cli.md` (tag `#reference`, flags + invocation pattern) and `context/learnings/claude-agent-sdk-node.md` (tag `#reference` or `#concept`, whether it's usable and when to prefer over subprocess). Include concrete CLI snippets and doc links.

- [ ] **Step 2: Slack Bolt (TypeScript) — Socket Mode**

Check:

  1. Current stable version of `@slack/bolt` on npm.
  2. Socket Mode instantiation pattern — what's the minimal, current boilerplate? (constructor options, event registration syntax for `app_mention` and DM `message`).
  3. Required Slack app scopes — confirm `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `users:read` are still the right set, and `connections:write` for App-Level Token.
  4. Known pitfalls — any advisory about retries, 3s ack window, duplicate events.

Produce note: `context/learnings/slack-bolt-socket-mode.md` (tag `#reference`) with version, instantiation skeleton, required scopes, and any known gotchas (the latter promoted to a separate `#gotcha` note if non-trivial).

- [ ] **Step 3: MCP ecosystem for Slack & GitHub**

Check:

  1. Is there an official or widely-adopted MCP Slack server (`@modelcontextprotocol/server-slack` or similar)? What does it expose — receive-events, send-messages, or both?
  2. Same for GitHub (`@modelcontextprotocol/server-github`).
  3. If either dramatically simplifies the design, note it. **Decision gate:** if an MCP Slack server offers push-style subscription (not just pull/call), we may defer writing `SlackChannel` entirely and let Claude handle both sides via MCP. Write your recommendation with evidence.

Produce notes: `context/learnings/mcp-slack-server.md` and `context/learnings/mcp-github-server.md` (tag `#reference`), each with availability status, what tools each exposes, and a recommendation for MVP. If MCP Slack changes the SlackChannel design, add a `#concept` note with the reasoning and flag it as a potential spec amendment before proceeding.

- [ ] **Step 4: `gh` CLI flags**

Run `gh repo list --help` (on your host machine if `gh` is installed; or check the official gh docs). Confirm:
  - `gh repo list <org> --json name,description --limit 100` still prints the expected JSON shape.
  - Any newer flag like `--visibility` or `--topic` worth knowing.
  - Auth via `GH_TOKEN` env var still works for the `repo list` subcommand with `read:org` scope.

Produce note: `context/learnings/gh-repo-list-json.md` (tag `#reference`) with the exact command, JSON shape it returns, and auth caveats (env-var PAT, SSO, scopes).

- [ ] **Step 5: Node LTS**

Check `nodejs.org/en/about/previous-releases`. Identify the current Active LTS (should be an even major number). If 24 is LTS, target 24; if 22 is still LTS, target 22. Produce note: `context/learnings/node-lts-current.md` (tag `#reference`) with the current Active LTS, its EOL, and the next LTS timeline.

- [ ] **Step 6: Dockerfile best practices**

Check current guidance (Docker docs, node official image repo). Note:
  - Recommended base image tag for the Node LTS (e.g., `node:24-slim`, `node:24-bookworm-slim`).
  - Whether multi-stage is still the standard or if there's a newer pattern.
  - Non-root user recommendation — is running as `node` user expected now?

Produce note: `context/learnings/docker-node-slim-best-practices.md` (tag `#reference`) with current recommended base tag, whether multi-stage is still standard, non-root user practice, and any other relevant guidance surfaced.

- [ ] **Step 7: Update the learnings MOC**

Edit `context/_index/learnings.md` — under each tag section (`#reference`, `#concept`, `#gotcha`), add a one-line bullet for every note created in steps 1–6, linking to it with an Obsidian wikilink. Example:

```markdown
## `#reference` — Environment and commands

- [[../learnings/claude-code-headless-cli|Claude Code headless CLI]] — invocation pattern and flags (as of 2026-04-15).
- [[../learnings/slack-bolt-socket-mode|Slack Bolt Socket Mode]] — current stable setup.
- ...
```

This keeps the MOC honest and makes the learnings discoverable via the `#reference` tag or the Obsidian graph view.

- [ ] **Step 8: Decision gate**

Re-read the spec (`[[spec]]`) with the findings in hand. Ask: **does any finding invalidate a spec decision or success criterion?**

  - **No** → proceed to Task 1 as planned.
  - **Yes** → stop. Open discussion with Operator. Amend spec, re-run spec review, then return.

- [ ] **Step 9: Commit**

```bash
git add context/learnings/ context/_index/learnings.md
git commit -m "docs: record discovery findings as atomic learnings"
```

---

### Task 1: Update constitution with finalized stack decisions

Update `context/constitution.md` to drop the "exploratory phase" language and lock in the decisions made during brainstorming + discovery.

**Files to modify:**
- `context/constitution.md`

- [ ] **Step 1: Replace the "Architecture principles" section**

Replace the current "_Not yet decided._ When the first architectural commitments..." block with locked-in commitments:

```markdown
## Architecture principles

- **Ports & adapters.** Two pluggable abstractions exist: `Channel` (message sources — Slack today, Discord/Telegram/etc. future) and `AgentBackend` (LLMs — Claude Code today, Codex/Gemini future). The Agent Core orchestrator depends only on these interfaces, never on concrete implementations.
- **Zero custom tools by default.** Capabilities come from Claude Code's built-in toolset (Bash, Read, Write, Edit, Grep, Glob). Custom tools require justification.
- **Stateless per turn (MVP).** No conversation memory between Slack mentions. Persistent thread sessions are a future iteration with explicit storage decisions attached.
- **Sandboxed execution.** Shell access (Bash tool) runs inside the Docker container only. Container has no host filesystem access beyond mounted volumes.

Principles that remain:

- **Reversibility first.** Prefer choices that are easy to back out of.
- **One decision at a time.** Don't bundle stack choices; each should have its own rationale.
- **Write before you build.** If a solution isn't obvious in one sentence, use the spec flow (`/spec`).
```

- [ ] **Step 2: Replace the "Tooling and workflow principles" section**

Replace "_Not yet decided._" with locked-in tooling:

```markdown
## Tooling and workflow principles

- **Language:** TypeScript, strict mode. Node 24 LTS.
- **Package manager:** npm.
- **Runtime container:** `node:24-slim`. See `context/learnings/docker-node-image-variants.md`.
- **Tests:** `vitest`. Unit tests for pure functions and well-mocked boundaries; smoke tests for integration.
- **Logging:** `pino`, structured JSON to stdout.
- **Env validation:** `zod`.
- **Slack integration:** `@slack/bolt@4` with Socket Mode.
- **LLM:** `@anthropic-ai/claude-agent-sdk` in-process, authenticated via `CLAUDE_CODE_OAUTH_TOKEN` (subscription OAuth, not API key).

Workflow principles that already apply:

- **Never push to `main`.** Always branch + PR. Pushing to `main`/`master` is blocked by convention — it triggers deploys/automations (see global rule 20).
- **Use `/open-pr`** to open pull requests. It generates title and description consistently.
- **Explicit consent for `git add`/`commit`/`push`.** No autonomous git writes.
- **Read-only database.** No write queries without approval.
```

- [ ] **Step 3: Verify the "Why Zeno exists" section is correct**

The opening prose was already updated inline during pre-implementation cleanup. Confirm it matches:

```markdown
## Why Zeno exists

Zeno is a personal agent. The person who owns this instance is described in `USER.md` at the repo root (gitignored — see `USER.example.md` for the template). This repository is Zeno's workspace — the place where Zeno's identity, configuration, and operating knowledge live. It runs as a Dockerized Node/TypeScript process on the user's machine, connects to messaging channels (Slack first), and uses Claude Code (authenticated via OAuth) as its reasoning engine. The architecture is ports-and-adapters so additional channels (Discord, Telegram) and backends (Codex, Gemini) can be added without changing the core.

The initial scope is deliberately minimal: one channel (Slack), one backend (Claude Code), zero custom tools. Beyond MVP, Zeno is intended to grow into a development agent — clone repos, edit code, open PRs — invoked from Slack threads.
```

- [ ] **Step 4: Commit**

```bash
git add context/constitution.md
git commit -m "docs: update constitution with finalized stack decisions"
```

---

## Phase 2: Project Bootstrap

### Task 2: Node project init

**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `.nvmrc`, `.dockerignore`, `biome.json`
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
  "name": "zeno-agent",
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
    "test:watch": "vitest",
    "format": "biome format --write .",
    "lint": "biome lint .",
    "check": "biome check --write ."
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^<LATEST>",
    "@slack/bolt": "^4.7.0",
    "pino": "^<LATEST>",
    "zod": "^<LATEST>"
  },
  "devDependencies": {
    "@biomejs/biome": "^<LATEST>",
    "@types/node": "^24",
    "tsx": "^<LATEST>",
    "typescript": "^<LATEST>",
    "vitest": "^<LATEST>"
  }
}
```

Replace each `<LATEST>` with the newest stable version at install time (`npm view <pkg> version`). Then run `npm install` to generate the lockfile. `@slack/bolt@4.7.0` and `@types/node@^24` are pinned from Task 0 findings; the rest float at latest.

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

- [ ] **Step 6: Create `biome.json`**

Biome handles formatting + linting + import organization. Convention: single quotes, always semicolons, organized imports. See `context/conventions/code-style.md`.

```json
{
  "$schema": "https://biomejs.dev/schemas/<VERSION>/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["src/**/*.ts", "tests/**/*.ts", "*.json"] },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "jsxQuoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all",
      "arrowParentheses": "always",
      "bracketSameLine": false,
      "bracketSpacing": true,
      "quoteProperties": "asNeeded"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "warn" }
    }
  },
  "assist": {
    "enabled": true,
    "actions": { "source": { "organizeImports": "on" } }
  }
}
```

Replace `<VERSION>` with the installed Biome major.minor.patch.

- [ ] **Step 7: Verify TS compiles (empty project)**

```bash
mkdir -p src && echo 'export {}' > src/index.ts
npm run typecheck
```

Expected: no output, exit 0. Then remove the stub: `rm src/index.ts`.

- [ ] **Step 8: Verify Biome runs clean**

```bash
npx biome check .
```

Expected: "No fixes applied" or success message.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json .nvmrc .gitignore .dockerignore biome.json
git commit -m "chore: init Node/TS project with Biome"
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
      CLAUDE_CODE_OAUTH_TOKEN: "cct_abc",
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
    expect(cfg.claude.oauthToken).toBe("cct_abc")
  })

  it("throws with clear message on missing SLACK_APP_TOKEN", () => {
    delete process.env.SLACK_APP_TOKEN
    expect(() => loadConfig()).toThrow(/SLACK_APP_TOKEN/)
  })

  it("throws on missing CLAUDE_CODE_OAUTH_TOKEN", () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    expect(() => loadConfig()).toThrow(/CLAUDE_CODE_OAUTH_TOKEN/)
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

Expected: all four tests fail (module doesn't exist).

- [ ] **Step 3: Implement `src/config.ts`**

```ts
import { z } from "zod"

const schema = z.object({
  SLACK_APP_TOKEN: z.string().startsWith("xapp-"),
  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-"),
  GH_TOKEN: z.string().min(1),
  CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  WORKSPACE_DIR: z.string().default("/workspace"),
})

export type Config = {
  slack: { appToken: string; botToken: string }
  github: { token: string }
  claude: { oauthToken: string }
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
    claude: { oauthToken: e.CLAUDE_CODE_OAUTH_TOKEN },
    logLevel: e.LOG_LEVEL,
    workspaceDir: e.WORKSPACE_DIR,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all four pass.

- [ ] **Step 5: Create `src/logger.ts`**

```ts
import pino from "pino"
import { loadConfig } from "./config.js"

export const logger = pino({
  level: loadConfig().logLevel,
  base: { service: "zeno-agent" },
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

# Claude Code — obtain via `docker compose run --rm zeno-agent claude setup-token`
CLAUDE_CODE_OAUTH_TOKEN=REPLACE_ME

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
 * A message source Zeno can listen to and reply on.
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

### Task 8: `ClaudeCodeBackend` via Claude Agent SDK (TDD)

**Files:**
- Create: `src/agent/backends/claude-code.ts`, `tests/agent/backends/claude-code.test.ts`

**Approach confirmed by Task 0:** use the official `@anthropic-ai/claude-agent-sdk` in-process via `query()`. SDK reads `CLAUDE_CODE_OAUTH_TOKEN` from env automatically. No subprocess. See `[[../../learnings/claude-agent-sdk-typescript]]`.

- [ ] **Step 1: Write failing tests**

`tests/agent/backends/claude-code.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the SDK module BEFORE importing the unit under test
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: vi.fn() }))

import { query } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeBackend } from "../../../src/agent/backends/claude-code.js"

function mockQueryStream(messages: any[]): void {
  vi.mocked(query).mockImplementation(() => {
    async function* gen() {
      for (const m of messages) yield m
    }
    return gen() as any
  })
}

function mockQueryThrow(error: Error): void {
  vi.mocked(query).mockImplementation(() => {
    async function* gen() {
      throw error
      // eslint-disable-next-line no-unreachable
      yield undefined as any
    }
    return gen() as any
  })
}

const baseInput = {
  systemPrompt: "You are Zeno.",
  userMessage: "oi",
  cwd: "/workspace",
  correlationId: "test-cid",
}

beforeEach(() => vi.clearAllMocks())

describe("ClaudeCodeBackend", () => {
  it("passes prompt, systemPrompt, cwd, and allowed tools to query()", async () => {
    mockQueryStream([{ type: "result", result: "hi", total_cost_usd: 0.001 }])
    const backend = new ClaudeCodeBackend()
    await backend.query(baseInput)

    expect(query).toHaveBeenCalledOnce()
    const call = vi.mocked(query).mock.calls[0][0]
    expect(call.prompt).toBe("oi")
    expect(call.options?.systemPrompt).toBe("You are Zeno.")
    expect(call.options?.cwd).toBe("/workspace")
    expect(call.options?.allowedTools).toContain("Bash")
    expect(call.options?.tools).toEqual({ type: "preset", preset: "claude_code" })
    expect(call.options?.permissionMode).toBe("bypassPermissions")
  })

  it("returns text from the final `result` message", async () => {
    mockQueryStream([
      { type: "system", subtype: "init" },
      { type: "assistant", message: { content: [{ type: "text", text: "thinking..." }] } },
      { type: "result", result: "final answer", total_cost_usd: 0.001 },
    ])
    const backend = new ClaudeCodeBackend()
    const out = await backend.query(baseInput)
    expect(out.text).toBe("final answer")
  })

  it("captures tool_use blocks as toolCalls for logging", async () => {
    mockQueryStream([
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", name: "Bash", input: { command: "gh repo list" } },
          ],
        },
      },
      { type: "result", result: "done", total_cost_usd: 0.001 },
    ])
    const backend = new ClaudeCodeBackend()
    const out = await backend.query(baseInput)
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0].tool).toBe("Bash")
    expect(out.toolCalls[0].input).toEqual({ command: "gh repo list" })
  })

  it("classifies auth_expired when the SDK throws an auth-related error", async () => {
    mockQueryThrow(new Error("Authentication failed: CLAUDE_CODE_OAUTH_TOKEN invalid"))
    const backend = new ClaudeCodeBackend()
    await expect(backend.query(baseInput)).rejects.toMatchObject({
      name: "AgentBackendError",
      kind: "auth_expired",
    })
  })

  it("classifies rate_limited on usage-limit errors", async () => {
    mockQueryThrow(new Error("Rate limit exceeded: monthly usage cap"))
    const backend = new ClaudeCodeBackend()
    await expect(backend.query(baseInput)).rejects.toMatchObject({ kind: "rate_limited" })
  })

  it("wraps anything else as kind=unknown", async () => {
    mockQueryThrow(new Error("something weird"))
    const backend = new ClaudeCodeBackend()
    await expect(backend.query(baseInput)).rejects.toMatchObject({ kind: "unknown" })
  })
})
```

- [ ] **Step 2: Verify they fail**

```bash
npm test -- claude-code
```

Expected: all six fail (module missing).

- [ ] **Step 3: Implement `src/agent/backends/claude-code.ts`**

```ts
import { query } from "@anthropic-ai/claude-agent-sdk"
import type { AgentBackend, AgentInput, AgentOutput, ToolCallSummary } from "../types.js"
import { AgentBackendError } from "../types.js"
import { logger } from "../../logger.js"

export interface ClaudeCodeBackendOptions {
  /** Max wall-clock ms; on expiry the AbortController fires and raises kind=timeout. */
  timeoutMs?: number
  /** Tools auto-approved. MVP: Bash only. */
  allowedTools?: string[]
}

export class ClaudeCodeBackend implements AgentBackend {
  readonly name = "claude-code"
  private readonly timeoutMs: number
  private readonly allowedTools: string[]

  constructor(opts: ClaudeCodeBackendOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 60_000
    this.allowedTools = opts.allowedTools ?? ["Bash"]
  }

  async query(input: AgentInput): Promise<AgentOutput> {
    logger.info(
      { event: "backend_started", backend: this.name, correlationId: input.correlationId },
      "starting claude agent SDK query",
    )

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    const toolCalls: ToolCallSummary[] = []
    let finalText = ""

    try {
      const iter = query({
        prompt: input.userMessage,
        options: {
          systemPrompt: input.systemPrompt,
          allowedTools: this.allowedTools,
          tools: { type: "preset", preset: "claude_code" },
          cwd: input.cwd,
          permissionMode: "bypassPermissions",
          abortController: controller,
        },
      })

      for await (const msg of iter) {
        if (msg.type === "result" && typeof msg.result === "string") {
          finalText = msg.result
        } else if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
          for (const block of msg.message.content) {
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
    } catch (err) {
      throw classifyError(err, this.timeoutMs, controller.signal.aborted)
    } finally {
      clearTimeout(timer)
    }

    logger.info(
      {
        event: "backend_completed",
        backend: this.name,
        correlationId: input.correlationId,
        toolCalls: toolCalls.length,
      },
      "claude completed",
    )

    return { text: finalText || "(sem resposta)", toolCalls }
  }
}

function classifyError(err: unknown, timeoutMs: number, aborted: boolean): AgentBackendError {
  if (aborted) {
    return new AgentBackendError("timeout", `claude exceeded ${timeoutMs}ms`, err)
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (/authenticat|oauth|unauthorized|401|CLAUDE_CODE_OAUTH_TOKEN/i.test(msg)) {
    return new AgentBackendError("auth_expired", "Claude OAuth token invalid or expired", err)
  }
  if (/rate limit|usage limit|usage cap|quota/i.test(msg)) {
    return new AgentBackendError("rate_limited", "Claude plan limit reached", err)
  }
  return new AgentBackendError("unknown", `claude SDK failure: ${msg.slice(0, 400)}`, err)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- claude-code
```

Expected: all six pass.

- [ ] **Step 5: Commit**

```bash
git add src/agent/backends/claude-code.ts tests/agent/backends/claude-code.test.ts
git commit -m "feat(agent): ClaudeCodeBackend using Claude Agent SDK"
```

---

### Task 9: System prompt builder

**Files:**
- Create: `src/agent/system-prompt.ts`

The system prompt is built at boot from a static base + the contents of `USER.md` (loaded by `index.ts`, see Task 11). This keeps Zeno's identity stable while letting each user inject their own preferences/context without modifying source.

- [ ] **Step 1: Implement `src/agent/system-prompt.ts`**

```ts
const BASE_PROMPT = `
You are Zeno, a personal agent. Your workspace is the Docker container you run in. The repository that hosts you is github.com/octocat/zeno-agent.

# Language
Reply in Brazilian Portuguese by default. Switch only if the user writes in another language.

# Tone
Direct, practical, minimal fluff. Light humor is ok. Keep replies short. Use Slack markdown — code blocks for commands/output, **bold** for emphasis. Avoid large tables.

# Environment
You have access to the Bash tool inside a Linux container with:
  • gh CLI, already authenticated via GH_TOKEN (scopes: repo, read:org)
  • git, node 24, npm, curl, jq
  • /workspace is where you can clone repos and work; it's a persistent volume

For GitHub operations, prefer \`gh\` with --json flags for structured output. Example:
  \`gh repo list <org> --json name,description --limit 100\`

# Safety rules
Do not run — without asking the user first — any of:
  • rm -rf outside /workspace
  • git push --force
  • gh repo delete, gh pr merge
  • Any command touching shared resources (deploys, databases, external APIs with side effects)

Never echo the content of GH_TOKEN, ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, or any variable whose name contains TOKEN, KEY, or SECRET. Never send file contents from the host to external URLs.

# Behavior
If you can't do something, explain why clearly (e.g., "your PAT doesn't have read:org for that org").
If you need clarification, ask in ONE sentence.
Do not speculate — confirm the goal before starting anything that takes time.
`.trim()

const NO_USER_NOTE = "_USER.md not found — Zeno is operating without user-specific context. Address the user generically and ask for missing details (name, github username, preferences) when relevant._"

/**
 * Build the full system prompt by appending the user profile (USER.md content)
 * to the static base. Pass null when USER.md is missing — a fallback note is used.
 */
export function buildSystemPrompt(userMdContent: string | null): string {
  const userBlock = userMdContent && userMdContent.trim().length > 0
    ? userMdContent.trim()
    : NO_USER_NOTE
  return `${BASE_PROMPT}\n\n# About the user\n\n${userBlock}`
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/agent/system-prompt.ts
git commit -m "feat(agent): system-prompt builder with USER.md injection"
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
import { logger } from "../logger.js"

export interface AgentCoreOptions {
  backend: AgentBackend
  workspaceDir: string
  /** Full system prompt (built once at boot via buildSystemPrompt). */
  systemPrompt: string
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
          systemPrompt: this.opts.systemPrompt,
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
        return "minha sessão Claude expirou. Roda `docker compose run --rm zeno-agent claude setup-token` pra me reautenticar."
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
import { readFileSync } from "node:fs"
import { loadConfig } from "./config.js"
import { logger } from "./logger.js"
import { SlackChannel } from "./channels/slack/adapter.js"
import { ClaudeCodeBackend } from "./agent/backends/claude-code.js"
import { AgentCore } from "./agent/core.js"
import { buildSystemPrompt } from "./agent/system-prompt.js"

async function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env } })
    let out = "", err = ""
    p.stdout?.on("data", (d) => (out += d.toString()))
    p.stderr?.on("data", (d) => (err += d.toString()))
    p.on("close", (code) => resolve({ code, out, err }))
  })
}

/** Try /app/USER.md (Docker mount) first, then ./USER.md (dev mode). */
function loadUserMd(): string | null {
  for (const path of ["/app/USER.md", "USER.md"]) {
    try {
      const content = readFileSync(path, "utf8").trim()
      if (content.length > 0) return content
    } catch { /* try next candidate */ }
  }
  return null
}

async function healthChecks(config: ReturnType<typeof loadConfig>): Promise<void> {
  // 1. gh CLI authenticated (used by Claude's Bash tool at runtime)
  const gh = await run("gh", ["auth", "status"], { GH_TOKEN: config.github.token })
  if (gh.code !== 0) {
    throw new Error(`gh auth failed: ${gh.err.slice(0, 200)}`)
  }
  logger.info({ event: "github_auth_ok" }, "gh CLI authenticated")

  // 2. claude CLI available (for setup-token re-runs; not used at request time)
  const cc = await run("claude", ["--version"])
  if (cc.code !== 0) {
    throw new Error(`claude --version failed: ${cc.err.slice(0, 200)}`)
  }
  logger.info({ event: "claude_cli_ok", version: cc.out.trim() }, "claude CLI available")

  // 3. CLAUDE_CODE_OAUTH_TOKEN presence was already validated by loadConfig() via zod.
  logger.info({ event: "claude_oauth_token_present" }, "Claude OAuth token configured")
}

async function main() {
  const config = loadConfig()
  logger.info({ event: "boot_start" }, "Zeno booting")

  await healthChecks(config)

  // Load USER.md (gitignored) and bake it into the system prompt
  const userMd = loadUserMd()
  if (userMd) {
    logger.info({ event: "user_md_loaded", bytes: userMd.length }, "USER.md loaded")
  } else {
    logger.warn({ event: "user_md_missing" }, "USER.md not found — Zeno will run without user-specific context")
  }
  const systemPrompt = buildSystemPrompt(userMd)

  const backend = new ClaudeCodeBackend()
  const core = new AgentCore({ backend, workspaceDir: config.workspaceDir, systemPrompt })

  const slack = new SlackChannel(config.slack)
  await slack.start(core.bind(slack))

  logger.info({ event: "zeno_online" }, "Zeno online")

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

Node 24 was confirmed by Task 0 as the current Active LTS — see `[[../../learnings/node-lts-current]]`. The `claude` CLI is installed only for setup-time use (`claude setup-token`, re-login); runtime uses the SDK in-process.

- [ ] **Step 2: Build the image**

```bash
docker build -t zeno-agent:dev .
```

Expected: succeeds. Note the final image size (`docker images zeno-agent:dev`); should be roughly 500–800MB.

- [ ] **Step 3: Smoke-check the built image**

```bash
docker run --rm zeno-agent:dev bash -c "node --version && gh --version && claude --version && git --version"
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
  zeno-agent:
    build: .
    image: zeno-agent:dev
    container_name: zeno-agent
    env_file: .env
    volumes:
      - workspace:/workspace
      - ./USER.md:/app/USER.md:ro
      - ./context:/app/context:ro
    restart: unless-stopped
    stdin_open: true
    tty: true

volumes:
  workspace:
```

`stdin_open` + `tty` are required so `docker compose run --rm zeno-agent claude setup-token` can open the browser URL interactively. The `USER.md` mount is read-only and required: if `USER.md` doesn't exist locally, `docker compose up` fails with a clear file-not-found error — that's intentional, since Zeno needs the user profile to personalize. The README documents copying `USER.example.md` to `USER.md` as a setup step. No `claude-home` volume is needed: the OAuth token is plain text in `.env` (env var `CLAUDE_CODE_OAUTH_TOKEN`), read by the SDK directly.

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
# Zeno

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

2. Create your user profile:

   \`\`\`bash
   cp USER.example.md USER.md
   \`\`\`

   Open \`USER.md\` and fill in your name, GitHub username, Slack user ID, and any preferences/context you want Zeno to know. The file is gitignored — your profile never leaves the machine. Required: \`docker compose up\` will fail without it.

3. Build the image:

   \`\`\`bash
   docker compose build
   \`\`\`

4. Mint the Claude Code OAuth token (first time, and whenever it expires):

   \`\`\`bash
   docker compose run --rm zeno-agent claude setup-token
   \`\`\`

   A browser URL prints in the terminal — open it, complete OAuth on your host browser, the CLI prints the token. Paste the token into \`.env\` as \`CLAUDE_CODE_OAUTH_TOKEN=<token>\`.

5. Start Zeno:

   \`\`\`bash
   docker compose up -d
   docker compose logs -f zeno-agent
   \`\`\`

   Watch for the \`zeno_online\` log event. The line \`user_md_loaded\` confirms your profile was read.

## Usage

Mention the bot in any Slack channel where it's invited:

> @zeno-agent quais repos tem na octocat?

Or DM it directly.

## Performance

The spec targets ~30 seconds end-to-end for the happy path — this is a **warm-path** target, not a guarantee. Cold-start responses (first mention after container restart or a full rebuild) may take 45–60 seconds as Claude Code initializes its session and tools.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "minha sessão Claude expirou" | Re-run \`docker compose run --rm zeno-agent claude setup-token\`, paste new token into \`.env\`, \`docker compose up -d --force-recreate\` |
| Container exits with "Invalid environment" | Check \`.env\` — all four vars (\`SLACK_APP_TOKEN\`, \`SLACK_BOT_TOKEN\`, \`GH_TOKEN\`, \`CLAUDE_CODE_OAUTH_TOKEN\`) must be set |
| Bot doesn't react to mentions | Verify the Socket Mode connection in the Slack app config; check logs for \`slack_connected\` |
| "não tenho acesso à org X" | Your PAT needs \`read:org\` and, for SAML SSO orgs, must be authorized for that org in GitHub settings |

## Architecture

See \`context/specs/0001-slack-zeno-mvp/\` for the full spec, plan, and task breakdown. Briefly:

- **Channels** (\`src/channels/\`) — pluggable message sources. Slack is MVP; Discord/Telegram are future.
- **Agent Core** (\`src/agent/core.ts\`) — wires a channel to a backend. Channel-agnostic and backend-agnostic.
- **Agent Backends** (\`src/agent/backends/\`) — pluggable reasoning engines. Claude Code is MVP (via \`@anthropic-ai/claude-agent-sdk\`); Codex/Gemini future.
- **Tools** — none. Zeno uses Claude Code's built-in tools (Bash etc.) directly. GitHub queries go via the \`gh\` CLI inside the container.
```

- [ ] **Step 2: Write `SMOKE.md`**

```markdown
# Zeno — Smoke Test Checklist

Run this after any change that touches container setup, authentication, or the Slack/backend plumbing.

## Pre-flight

- [ ] \`.env\` has \`SLACK_APP_TOKEN\`, \`SLACK_BOT_TOKEN\`, \`GH_TOKEN\`, \`CLAUDE_CODE_OAUTH_TOKEN\` set
- [ ] \`USER.md\` exists at the repo root (copied from \`USER.example.md\` and filled in)
- [ ] Zeno bot has been invited to at least one Slack channel you test in
- [ ] \`claude setup-token\` has been run and the resulting token is pasted into \`.env\`

## Boot

- [ ] \`docker compose up -d\` starts without error
- [ ] \`docker compose logs zeno-agent\` shows \`github_auth_ok\`
- [ ] Logs show \`claude_cli_ok\` with a version string
- [ ] Logs show \`claude_oauth_token_present\`
- [ ] Logs show \`user_md_loaded\` with byte count
- [ ] Logs show \`slack_connected\` with a \`botUserId\`
- [ ] Logs show \`zeno_online\`

## Happy path (Spec S1)

- [ ] Mention \`@zeno-agent quais repos tem na octocat?\` in a channel
- [ ] Eyes reaction appears on your message within ~2 seconds
- [ ] A reply lands in the same thread within ~30 seconds
- [ ] Reply is in Portuguese (PT-BR)
- [ ] Reply lists repos correctly (cross-check with \`gh repo list octocat\` locally)
- [ ] Eyes reaction is removed and replaced with \`:white_check_mark:\`

## DM path (Spec S2)

- [ ] Send \`oi\` as a DM to the Zeno bot
- [ ] Reply arrives in the DM (not in a thread, \`thread_ts\` is null)
- [ ] Reply is in Portuguese

## Org without access (Spec S3)

- [ ] Mention \`@zeno-agent quais repos tem na SomeOrgYouCantSee?\`
- [ ] Reply explains in plain language that there's no access
- [ ] Reply does not include raw stderr or mention the word "GH_TOKEN"

## Off-topic (Spec S4)

- [ ] Mention \`@zeno-agent qual a capital do Peru?\`
- [ ] Reply: "Lima" (or equivalent), no tool call in logs (\`backend_tool_call\` absent)

## Auth expired simulation (Spec S5)

- [ ] In \`.env\`, set \`CLAUDE_CODE_OAUTH_TOKEN\` to an obviously-invalid value (e.g., \`cct_bogus\`)
- [ ] \`docker compose up -d --force-recreate\` so the SDK picks up the bad token
- [ ] Mention \`@zeno-agent oi\`
- [ ] Reply instructs to run \`docker compose run --rm zeno-agent claude setup-token\`
- [ ] Logs show \`handler_failed\` with error kind \`auth_expired\`
- [ ] Restore: run \`setup-token\`, paste real token, \`--force-recreate\` again
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
docker compose down --volumes  # WARNING: wipes workspace volume; confirm with Operator before running on a live install
docker compose build --no-cache
```

- [ ] **Step 2: Create `.env` from example and populate real tokens**

Fill Slack tokens and `GH_TOKEN`. Leave `CLAUDE_CODE_OAUTH_TOKEN` blank — filled in step 3.

- [ ] **Step 3: Mint the Claude OAuth token**

```bash
docker compose run --rm zeno-agent claude setup-token
```

Follow the browser flow, copy the printed token into `.env` as `CLAUDE_CODE_OAUTH_TOKEN=...`.

- [ ] **Step 4: Start the stack**

```bash
docker compose up -d
docker compose logs -f zeno-agent
```

Verify boot logs match the "Boot" section of `SMOKE.md`.

- [ ] **Step 5: Walk through `SMOKE.md` checklist**

Mark each item as passed or file a bug. Do not mark this task complete until every item in `SMOKE.md` passes.

- [ ] **Step 6: Mark spec as shipped**

Edit `context/specs/0001-slack-zeno-mvp/spec.md` frontmatter:

```yaml
---
status: shipped
feature: slack-zeno-mvp
created: 2026-04-15
shipped: <YYYY-MM-DD>
---
```

Update `context/_index/specs.md`: move the "0001-slack-zeno-mvp" bullet from "Active" to "Shipped" with the ship date.

- [ ] **Step 7: Commit**

```bash
git add context/specs/0001-slack-zeno-mvp/spec.md context/_index/specs.md
git commit -m "chore: mark slack-zeno-mvp shipped"
```

- [ ] **Step 8: Post-mortem notes**

If anything surprised you during implementation — a gotcha, a constraint, a surprising behavior — add an atomic note to `context/learnings/` using `context/templates/learning.md`. Link it to this spec with a wikilink. This is part of the project's standard after-work practice (see `AGENTS.md`).
