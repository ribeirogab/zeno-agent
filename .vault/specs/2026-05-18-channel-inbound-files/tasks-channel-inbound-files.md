---
feature: channel-inbound-files
plan: "[[plan-channel-inbound-files]]"
spec: "[[spec-channel-inbound-files]]"
created: 2026-05-18
---
# Channel Inbound Files — Tasks

**For this plan:** [[plan-channel-inbound-files]]

> All commands run from the worktree root for this branch. `pnpm run quality-gate` is the lint + typecheck + tests gate. Never use `--no-verify`.

## Phase 0: Preflight

### Task 0: Confirm baseline green

- [ ] **Step 0.1: Confirm baseline `pnpm run quality-gate` passes on the unmodified worktree**

Run: `pnpm run quality-gate`
Expected: exit 0. If anything fails here, STOP and investigate before any edit.

- [ ] **Step 0.2: Confirm the only call sites of `wrapWithSlackContext` are the two known locations**

Run: `grep -rn 'wrapWithSlackContext' apps/worker`
Expected output (exactly these two lines plus `apps/worker/tests/agent/wrap-context.test.ts` matches):
```
apps/worker/src/agent/core.ts:82:        userMessage: wrapWithSlackContext(message),
apps/worker/src/agent/core.ts:173:export function wrapWithSlackContext(message: IncomingMessage): string {
apps/worker/tests/agent/wrap-context.test.ts:<various>
```
If there are any other call sites (other apps, other packages), STOP and surface to the operator — the plan does not cover external consumers.

- [ ] **Step 0.3: Confirm `apps/worker/tests/channels/slack/adapter.test.ts` does NOT exist yet**

Run: `test ! -f apps/worker/tests/channels/slack/adapter.test.ts && echo OK`
Expected: `OK`. The new test file is created in Task 4.

---

## Phase 1: Wrapper refactor (TDD)

### Task 1: Update existing wrap-context tests to the new symbol name

**Files:**
- Modify: `apps/worker/tests/agent/wrap-context.test.ts`

- [ ] **Step 1.1: Read the current file and confirm its shape**

Run: `wc -l apps/worker/tests/agent/wrap-context.test.ts`
Expected: 100 lines.

- [ ] **Step 1.2: Rename the symbol under test in import + describe + all call sites**

Edit `apps/worker/tests/agent/wrap-context.test.ts`:
- Replace `import { wrapWithSlackContext } from '@/agent/core';` with `import { wrapWithChannelContext } from '@/agent/core';`
- Replace `describe('wrapWithSlackContext', () => {` with `describe('wrapWithChannelContext', () => {`
- Replace every `wrapWithSlackContext(...)` call (4 occurrences) with `wrapWithChannelContext(...)`

You can do all four replacements with a single `replace_all` per token if your editor supports it.

- [ ] **Step 1.3: Run the test file — it must FAIL with "wrapWithChannelContext is not exported"**

Run: `cd apps/worker && pnpm vitest run tests/agent/wrap-context.test.ts`
Expected: FAIL. Compiler error: `Module '"@/agent/core"' has no exported member 'wrapWithChannelContext'`.

- [ ] **Step 1.4: DO NOT commit yet** — proceed directly to Task 2 (the source rename) so the test goes green.

### Task 2: Rename + restructure `wrapWithSlackContext` → `wrapWithChannelContext` in core.ts

**Files:**
- Modify: `apps/worker/src/agent/core.ts:173-204` (function body)
- Modify: `apps/worker/src/agent/core.ts:82` (call site)

- [ ] **Step 2.1: Replace the function body**

In `apps/worker/src/agent/core.ts`, replace lines 167-204 (the JSDoc + `wrapWithSlackContext` function) with:

```ts
/**
 * Prepend optional channel-context blocks to the user's message text.
 *
 * - `[slack_context]` + `[parent_message]`: emitted only when `platform === 'slack'`.
 *   Lets the agent default cron tool args (notify_conversation_id, notify_thread_id)
 *   to the current Slack target.
 * - `[attached_files]`: emitted whenever `attachments?.length > 0`, regardless of platform.
 *   This is the channel-agnostic surface — any future channel adapter that populates
 *   `IncomingMessage.attachments[]` gets prompt surfacing for free.
 *
 * Concatenated into the user message — NOT into the system prompt — to keep the
 * prompt cache valid.
 */
/** @internal Exported for testing only. */
export function wrapWithChannelContext(message: IncomingMessage): string {
  const lines: string[] = [];

  // Slack-specific context blocks (gated by platform).
  if (message.platform === 'slack') {
    lines.push(
      '[slack_context]',
      `conversation_id: ${message.conversationId}`,
      `thread_id: ${message.threadId ?? 'null'}`,
      `user_id: ${message.userId}`,
      `current_time: ${new Date().toISOString()}`,
      '[/slack_context]',
    );

    if (message.parentText) {
      lines.push('');
      lines.push('[parent_message]');
      lines.push(message.parentText);
      lines.push('[/parent_message]');
    }
  }

  // Universal: any channel that populates attachments[] gets injection.
  if (message.attachments?.length) {
    if (lines.length) lines.push('');
    lines.push('[attached_files]');
    for (const attachment of message.attachments) {
      lines.push(`- ${attachment.localPath} (${attachment.mimetype}, ${attachment.name})`);
    }
    lines.push('[/attached_files]');
    lines.push('Read the attached files before responding.');
  }

  // No context blocks at all → return raw text unchanged.
  if (!lines.length) return message.text;

  lines.push('');
  lines.push(message.text);
  return lines.join('\n');
}
```

- [ ] **Step 2.2: Update the single call site at line 82**

Edit `apps/worker/src/agent/core.ts:82`:
- Replace `userMessage: wrapWithSlackContext(message),` with `userMessage: wrapWithChannelContext(message),`

- [ ] **Step 2.3: Verify no `wrapWithSlackContext` references remain in worker source**

Run: `grep -rn 'wrapWithSlackContext' apps/worker/src`
Expected: empty output (zero matches).

- [ ] **Step 2.4: Run the wrap-context test file — it must now PASS**

Run: `cd apps/worker && pnpm vitest run tests/agent/wrap-context.test.ts`
Expected: all existing tests PASS (the non-slack-no-attachments case still returns text verbatim; the slack cases still produce their expected blocks).

- [ ] **Step 2.5: Commit phase 1a — rename only**

```bash
git add apps/worker/src/agent/core.ts apps/worker/tests/agent/wrap-context.test.ts
git commit -m "refactor(worker): rename wrapWithSlackContext to wrapWithChannelContext

Pure rename + body restructure. No behavior change for slack messages:
existing wrap-context tests pass unchanged. Attachments injection is
now gated on attachments?.length (not platform), unblocking future
channel adapters from editing agent/core.ts to surface files.

Refs: .vault/specs/2026-05-18-channel-inbound-files/spec-channel-inbound-files.md"
```

### Task 3: Add new wrap-context tests for de-Slack-gated attachments + parity assertions

**Files:**
- Modify: `apps/worker/tests/agent/wrap-context.test.ts`

- [ ] **Step 3.1: Add three new tests at the bottom of the `describe` block (before the closing `});`)**

Insert these tests in `apps/worker/tests/agent/wrap-context.test.ts` immediately before the final `});` at line 100:

```ts
  it('emits [attached_files] block for non-slack platform with attachments', () => {
    const message = makeMessage({
      platform: 'discord',
      text: 'review this',
      attachments: [
        {
          name: 'x.pdf',
          mimetype: 'application/pdf',
          localPath: '/workspace/uploads/abc/x.pdf',
          sizeBytes: 1024,
        },
      ],
    });

    const result = wrapWithChannelContext(message);

    expect(result).toContain('[attached_files]');
    expect(result).toContain('- /workspace/uploads/abc/x.pdf (application/pdf, x.pdf)');
    expect(result).toContain('[/attached_files]');
    expect(result).toContain('Read the attached files before responding.');
    expect(result).toContain('review this');
    expect(result).not.toContain('[slack_context]');
    expect(result).not.toContain('[parent_message]');
  });

  it('returns text verbatim for non-slack platform with empty attachments array', () => {
    const message = makeMessage({ platform: 'discord', text: 'hi', attachments: [] });
    expect(wrapWithChannelContext(message)).toBe('hi');
  });

  it('parity: slack output is byte-identical across representative shapes', () => {
    // Freeze time so the `current_time` field is deterministic across shape variants.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-18T12:00:00.000Z'));
    try {
      const ts = '2026-05-18T12:00:00.000Z';

      // (a) slack + no parent + no attachments
      const a = wrapWithChannelContext(makeMessage({ text: 'hello' }));
      expect(a).toBe(
        `[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: ${ts}\n[/slack_context]\n\nhello`,
      );

      // (b) slack + parent text + no attachments
      const b = wrapWithChannelContext(
        makeMessage({ text: 'reply', parentText: 'original question' }),
      );
      expect(b).toBe(
        `[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: ${ts}\n[/slack_context]\n\n[parent_message]\noriginal question\n[/parent_message]\n\nreply`,
      );

      // (c) slack + no parent + one attachment
      const c = wrapWithChannelContext(
        makeMessage({
          text: 'see file',
          attachments: [
            {
              name: 'one.pdf',
              mimetype: 'application/pdf',
              localPath: '/w/u/c1/one.pdf',
              sizeBytes: 10,
            },
          ],
        }),
      );
      expect(c).toBe(
        `[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: ${ts}\n[/slack_context]\n\n[attached_files]\n- /w/u/c1/one.pdf (application/pdf, one.pdf)\n[/attached_files]\nRead the attached files before responding.\n\nsee file`,
      );

      // (d) slack + parent text + two attachments
      const d = wrapWithChannelContext(
        makeMessage({
          text: 'check these',
          parentText: 'context',
          attachments: [
            {
              name: 'a.png',
              mimetype: 'image/png',
              localPath: '/w/u/c1/a.png',
              sizeBytes: 1,
            },
            {
              name: 'b.pdf',
              mimetype: 'application/pdf',
              localPath: '/w/u/c1/b.pdf',
              sizeBytes: 2,
            },
          ],
        }),
      );
      expect(d).toBe(
        `[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: ${ts}\n[/slack_context]\n\n[parent_message]\ncontext\n[/parent_message]\n\n[attached_files]\n- /w/u/c1/a.png (image/png, a.png)\n- /w/u/c1/b.pdf (application/pdf, b.pdf)\n[/attached_files]\nRead the attached files before responding.\n\ncheck these`,
      );
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 3.2: Update the import line to include `vi`**

If `vi` is not already imported (current line is `import { describe, expect, it } from 'vitest';`), change to:
```ts
import { describe, expect, it, vi } from 'vitest';
```

- [ ] **Step 3.3: Run the test file — all tests must PASS**

Run: `cd apps/worker && pnpm vitest run tests/agent/wrap-context.test.ts`
Expected: 8 tests pass (5 original + 3 new). The parity test confirms byte-identity for the slack path; the non-slack-with-attachments test confirms the new behavior; the empty-attachments test confirms no regression for empty arrays.

- [ ] **Step 3.4: Run quality gate**

Run: `pnpm run quality-gate`
Expected: exit 0. No lint warnings about unused imports.

- [ ] **Step 3.5: Commit phase 1b — new tests**

```bash
git add apps/worker/tests/agent/wrap-context.test.ts
git commit -m "test(worker): cover de-Slack-gated attachments + slack parity

Three new tests on wrapWithChannelContext:
- emits [attached_files] for non-slack platform with attachments
- returns text verbatim for non-slack + empty attachments array
- parity: slack output byte-identical (toBe) across four shapes

The parity test freezes time with vi.useFakeTimers so current_time is
deterministic, guarding against accidental changes to the slack-path
prompt format (would invalidate Claude Agent SDK cache).

Refs: .vault/specs/2026-05-18-channel-inbound-files/spec-channel-inbound-files.md"
```

---

## Phase 2: Cleanup in Slack adapter (TDD)

### Task 4: Create `apps/worker/tests/channels/slack/adapter.test.ts` with cleanup tests

**Files:**
- Create: `apps/worker/tests/channels/slack/adapter.test.ts`

- [ ] **Step 4.1: Skim `apps/worker/tests/channels/slack/wait-reaction.test.ts` to confirm the `vi.mock('@slack/bolt')` pattern**

Run: `head -80 apps/worker/tests/channels/slack/wait-reaction.test.ts`
Confirm the file uses `vi.mock('@slack/bolt', ...)` with a fake `App` class that tracks listeners on `event(name, listener)` calls. This is the pattern Task 4 reuses.

- [ ] **Step 4.2: Create the new test file**

Create `apps/worker/tests/channels/slack/adapter.test.ts` with this exact content:

```ts
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EventListener = (args: { event: unknown }) => Promise<void> | void;

interface MockClient {
  conversations: { open: ReturnType<typeof vi.fn>; replies: ReturnType<typeof vi.fn> };
  chat: { postMessage: ReturnType<typeof vi.fn> };
  reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  auth: { test: ReturnType<typeof vi.fn> };
}

interface MockApp {
  client: MockClient;
  event: ReturnType<typeof vi.fn>;
  message: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  __listeners: Map<string, EventListener[]>;
}

const mockAppRef: { current: MockApp | null } = { current: null };

vi.mock('@slack/bolt', () => {
  class App {
    public readonly client: MockClient;
    public readonly event: ReturnType<typeof vi.fn>;
    public readonly message: ReturnType<typeof vi.fn>;
    public readonly start: ReturnType<typeof vi.fn>;
    public readonly stop: ReturnType<typeof vi.fn>;
    public readonly __listeners = new Map<string, EventListener[]>();

    constructor() {
      this.client = {
        conversations: {
          open: vi.fn(),
          replies: vi.fn().mockResolvedValue({ messages: [] }),
        },
        chat: { postMessage: vi.fn() },
        reactions: { add: vi.fn(), remove: vi.fn() },
        auth: { test: vi.fn().mockResolvedValue({ user_id: 'BOT1' }) },
      };
      this.event = vi.fn((name: string, listener: EventListener) => {
        const list = this.__listeners.get(name) ?? [];
        list.push(listener);
        this.__listeners.set(name, list);
      });
      this.message = vi.fn((listener: EventListener) => {
        const list = this.__listeners.get('message') ?? [];
        list.push(listener);
        this.__listeners.set('message', list);
      });
      this.start = vi.fn().mockResolvedValue(undefined);
      this.stop = vi.fn().mockResolvedValue(undefined);
      mockAppRef.current = this as unknown as MockApp;
    }
  }
  return { App, LogLevel: { WARN: 'WARN' } };
});

// downloadSlackFiles is the unit creating the uploads dir; mock it so we can
// control whether the dir is created and what attachments come back.
vi.mock('@/channels/slack/files', () => {
  return {
    downloadSlackFiles: vi.fn(),
  };
});

// Import AFTER vi.mock declarations so the mock takes effect.
const { SlackChannel } = await import('@/channels/slack/adapter');
const filesMod = await import('@/channels/slack/files');
const downloadSlackFiles = vi.mocked(filesMod.downloadSlackFiles);

const APP_TOKEN = 'xapp-fake';
const BOT_TOKEN = 'xoxb-fake';

async function dispatchAppMention(payload: {
  user: string;
  channel: string;
  ts: string;
  text: string;
  files?: Array<{ id: string; name: string }>;
}): Promise<void> {
  const listeners = mockAppRef.current?.__listeners.get('app_mention') ?? [];
  for (const listener of listeners) {
    await listener({ event: payload });
  }
}

describe('SlackChannel — per-turn uploads cleanup', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = join(tmpdir(), `zeno-slack-test-${randomUUID()}`);
    mkdirSync(workspaceDir, { recursive: true });
    downloadSlackFiles.mockReset();
    mockAppRef.current = null;
  });

  afterEach(() => {
    if (existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('dispatch without files emits no uploads cleanup log and does not call rm', async () => {
    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    const handler = vi.fn().mockResolvedValue(undefined);
    await channel.start(handler);

    await dispatchAppMention({
      user: 'U1',
      channel: 'C1',
      ts: '1710000000.000100',
      text: '<@BOT1> hello',
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(downloadSlackFiles).not.toHaveBeenCalled();
    // No upload dir was created at all.
    const uploadsRoot = join(workspaceDir, 'uploads');
    expect(existsSync(uploadsRoot)).toBe(false);
  });

  it('cleans uploads dir after handler resolves successfully', async () => {
    let capturedCorrelationId = '';
    downloadSlackFiles.mockImplementation(async (_files, _token, correlationId, wd) => {
      capturedCorrelationId = correlationId;
      const dir = join(wd, 'uploads', correlationId);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'a.txt'), 'data');
      return [{ name: 'a.txt', mimetype: 'text/plain', localPath: join(dir, 'a.txt'), sizeBytes: 4 }];
    });

    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    const handler = vi.fn().mockResolvedValue(undefined);
    await channel.start(handler);

    await dispatchAppMention({
      user: 'U1',
      channel: 'C1',
      ts: '1710000000.000200',
      text: '<@BOT1> review',
      files: [{ id: 'F1', name: 'a.txt' }],
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(capturedCorrelationId).not.toBe('');
    const uploadsDir = join(workspaceDir, 'uploads', capturedCorrelationId);
    expect(existsSync(uploadsDir)).toBe(false);
  });

  it('cleans uploads dir after handler throws', async () => {
    let capturedCorrelationId = '';
    downloadSlackFiles.mockImplementation(async (_files, _token, correlationId, wd) => {
      capturedCorrelationId = correlationId;
      const dir = join(wd, 'uploads', correlationId);
      mkdirSync(dir, { recursive: true });
      return [];
    });

    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    await channel.start(handler);

    await dispatchAppMention({
      user: 'U1',
      channel: 'C1',
      ts: '1710000000.000300',
      text: '<@BOT1> oops',
      files: [{ id: 'F1', name: 'b.txt' }],
    });

    expect(handler).toHaveBeenCalledOnce();
    const uploadsDir = join(workspaceDir, 'uploads', capturedCorrelationId);
    expect(existsSync(uploadsDir)).toBe(false);
  });

  it('cleans the empty uploads dir when all files are skipped (oversize, etc.)', async () => {
    // Simulate downloadSlackFiles creating the dir via mkdir but returning [] (everything skipped).
    let capturedCorrelationId = '';
    downloadSlackFiles.mockImplementation(async (_files, _token, correlationId, wd) => {
      capturedCorrelationId = correlationId;
      const dir = join(wd, 'uploads', correlationId);
      mkdirSync(dir, { recursive: true });
      return [];
    });

    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    const handler = vi.fn().mockResolvedValue(undefined);
    await channel.start(handler);

    await dispatchAppMention({
      user: 'U1',
      channel: 'C1',
      ts: '1710000000.000400',
      text: '<@BOT1> huge',
      files: [{ id: 'F1', name: 'huge.bin' }],
    });

    const uploadsDir = join(workspaceDir, 'uploads', capturedCorrelationId);
    expect(existsSync(uploadsDir)).toBe(false);
  });

  it('dispatch resolves even when rm fails; original handler outcome is unaffected', async () => {
    let capturedCorrelationId = '';
    downloadSlackFiles.mockImplementation(async (_files, _token, correlationId, wd) => {
      capturedCorrelationId = correlationId;
      const dir = join(wd, 'uploads', correlationId);
      mkdirSync(dir, { recursive: true });
      return [];
    });

    // Spy on rm and force it to reject once. The dispatch must still resolve.
    const fsPromises = await import('node:fs/promises');
    const rmSpy = vi.spyOn(fsPromises, 'rm').mockRejectedValueOnce(new Error('disk full'));

    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    const handler = vi.fn().mockResolvedValue(undefined);
    await channel.start(handler);

    await expect(
      dispatchAppMention({
        user: 'U1',
        channel: 'C1',
        ts: '1710000000.000500',
        text: '<@BOT1> hi',
        files: [{ id: 'F1', name: 'c.txt' }],
      }),
    ).resolves.toBeUndefined();

    expect(handler).toHaveBeenCalledOnce();
    expect(rmSpy).toHaveBeenCalled();

    // Cleanup the dir ourselves since the mocked rm failed.
    const uploadsDir = join(workspaceDir, 'uploads', capturedCorrelationId);
    if (existsSync(uploadsDir)) {
      rmSync(uploadsDir, { recursive: true, force: true });
    }
    rmSpy.mockRestore();
  });
});
```

- [ ] **Step 4.3: Run the new test file — it must FAIL**

Run: `cd apps/worker && pnpm vitest run tests/channels/slack/adapter.test.ts`
Expected: most tests FAIL. The "no cleanup" test may pass by accident (no implementation = no cleanup), but the four cleanup-positive tests must fail with assertions like "existsSync returned true" because the adapter currently never removes the dir.

- [ ] **Step 4.4: DO NOT commit yet** — proceed to Task 5.

### Task 5: Implement cleanup in `apps/worker/src/channels/slack/adapter.ts`

**Files:**
- Modify: `apps/worker/src/channels/slack/adapter.ts:1-5` (imports)
- Modify: `apps/worker/src/channels/slack/adapter.ts:102-134` (dispatch body)

- [ ] **Step 5.1: Add the two new imports at the top of the file**

In `apps/worker/src/channels/slack/adapter.ts`, the current first imports are:
```ts
import { App, LogLevel } from '@slack/bolt';
import { createLogger } from '@zeno/logger';
import { downloadSlackFiles, type SlackFile } from '@/channels/slack/files';
```

Insert `node:fs/promises` and `node:path` imports above them so the file starts with:
```ts
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { App, LogLevel } from '@slack/bolt';
import { createLogger } from '@zeno/logger';
import { downloadSlackFiles, type SlackFile } from '@/channels/slack/files';
```

- [ ] **Step 5.2: Modify the download + handler block in `dispatch`**

Replace lines 102-134 of `apps/worker/src/channels/slack/adapter.ts` (the block starting `// Download file attachments when present` through the existing `try/catch`) with:

```ts
      // Download file attachments when present
      let uploadsDir: string | null = null;
      if (Array.isArray(slackEvent.files) && slackEvent.files.length > 0) {
        const workspaceDir = this.opts.workspaceDir ?? '/workspace';
        uploadsDir = join(workspaceDir, 'uploads', message.correlationId);
        message.attachments = await downloadSlackFiles(
          slackEvent.files,
          this.opts.botToken,
          message.correlationId,
          workspaceDir,
        );
      }

      logger.info(
        {
          event: 'message_received',
          platform: 'slack',
          userId: message.userId,
          correlationId: message.correlationId,
          attachments: message.attachments?.length ?? 0,
        },
        'slack message received',
      );
      try {
        await this.handler(message);
      } catch (error) {
        logger.error(
          {
            event: 'handler_error',
            correlationId: message.correlationId,
            err: String(error),
          },
          'handler threw',
        );
      } finally {
        if (uploadsDir) {
          try {
            await rm(uploadsDir, { recursive: true, force: true });
            logger.info(
              {
                event: 'slack_uploads_cleaned',
                correlationId: message.correlationId,
                path: uploadsDir,
              },
              'cleaned attachment uploads dir',
            );
          } catch (err) {
            logger.warn(
              {
                event: 'slack_uploads_cleanup_failed',
                correlationId: message.correlationId,
                err: String(err).slice(0, 200),
              },
              'failed to clean attachment uploads dir',
            );
          }
        }
      }
```

- [ ] **Step 5.3: Run the new adapter test file — it must PASS**

Run: `cd apps/worker && pnpm vitest run tests/channels/slack/adapter.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5.4: Run the wrap-context test file again to confirm no regression**

Run: `cd apps/worker && pnpm vitest run tests/agent/wrap-context.test.ts`
Expected: all 8 tests pass.

- [ ] **Step 5.5: Run quality gate**

Run: `pnpm run quality-gate`
Expected: exit 0. No new lint warnings (the new imports are used).

- [ ] **Step 5.6: Commit phase 2**

```bash
git add apps/worker/src/channels/slack/adapter.ts apps/worker/tests/channels/slack/adapter.test.ts
git commit -m "feat(worker): per-turn cleanup of slack uploads dir

Wrap the slack dispatch handler call in try/catch/finally. When
downloadSlackFiles was invoked this turn, rm -rf the
<workspaceDir>/uploads/<correlationId>/ directory after the handler
resolves (success or throw). Inner try/catch on the rm itself ensures
a cleanup failure warn-logs instead of breaking the dispatch loop.

Five new tests in apps/worker/tests/channels/slack/adapter.test.ts:
no-files no-op, success cleanup, post-throw cleanup, all-skipped
(empty dir) cleanup, rm-failure tolerance.

Closes the uploads-leak side of issue #9.

Refs: .vault/specs/2026-05-18-channel-inbound-files/spec-channel-inbound-files.md"
```

---

## Phase 3: E2E gate against `C0B0GLS5UTB`

### Task 6: Run E1-E4 and collect evidence

**Files:** (no source edits in this task except the temporary E4 throw)

> **Preflight already confirmed by the operator:** bot installed in `C0B0GLS5UTB`, profile running, Slack MCP connected.

- [ ] **Step 6.1: Build + restart the profile container with the new code**

Run: `pnpm run build && zeno restart <profile-name>`
Replace `<profile-name>` with the operator's profile (the one with the Slack bot installed in `flavianasser.slack.com`). Wait for `zeno logs <profile> --tail 5` to show the boot completion line.

- [ ] **Step 6.2: Run E1 (small PDF)**

In Slack web/desktop, upload a small (≤ 1 MB) multi-paragraph PDF to channel `C0B0GLS5UTB`. Send `@zeno summarize this file` in the same message or as a reply in the thread.

Verify within 30 seconds:
- Bot reply contains a summary referencing PDF content (not a generic apology).
- Run: `zeno logs <profile> --tail 80 | grep -E 'slack_(uploads|file)_|handler_'`
  - Confirm `event:"slack_uploads_cleaned"` appears with the dispatch's `correlationId`.
- Run: `docker exec $(docker ps --filter "name=<profile>" -q) ls /workspace/uploads/`
  - Confirm the per-turn `correlationId` directory is absent.

Capture:
- The Slack message permalink (right-click the bot reply → "Copy link to message").
- The log lines matching the grep above.
- The `docker exec ls` output.

- [ ] **Step 6.3: Run E2 (image describe)**

Same flow with a small (≤ 1 MB) PNG or JPEG. Send `@zeno what's in this image?`. Same verification + capture as E1.

- [ ] **Step 6.4: Run E3 (oversize skip)**

Upload a file larger than 50 MB (e.g., a video, or pad a binary with `dd if=/dev/zero of=big.bin bs=1M count=51`). Send `@zeno read this file`.

Verify:
- Bot reply does NOT reference the file's content.
- Worker log shows BOTH `event:"slack_file_too_large"` AND `event:"slack_uploads_cleaned"` for the same `correlationId`.
- `docker exec ... ls /workspace/uploads/` shows the per-turn dir is absent.

Capture same artifacts.

- [ ] **Step 6.5: Run E4 (handler error + cleanup)**

Apply the forced-throw recipe to `apps/worker/src/agent/core.ts`. Find the `bind` method's returned async function (starts around line 65-66) and insert this as the FIRST line inside it:

```ts
if (message.attachments?.length) throw new Error('e2e-forced-error');
```

Rebuild + restart: `pnpm run build && zeno restart <profile>`.

Upload a small file (≤ 100 KB) to `C0B0GLS5UTB` and mention `@zeno`. The handler will throw before producing a reply.

Verify:
- Worker log shows BOTH `event:"handler_error"` with `err` containing `e2e-forced-error` AND `event:"slack_uploads_cleaned"` for the same `correlationId`.
- `docker exec ... ls /workspace/uploads/` shows the per-turn dir is absent.

Capture artifacts.

- [ ] **Step 6.6: REVERT the forced throw**

Remove the `if (message.attachments?.length) throw new Error('e2e-forced-error');` line from `apps/worker/src/agent/core.ts`.

Verify revert:
- Run: `grep -r 'e2e-forced-error' apps/worker`
- Expected: empty output (zero matches).
- Run: `git diff apps/worker/src/agent/core.ts`
- Expected: empty diff (file restored to its committed state).

- [ ] **Step 6.7: Rebuild + final quality gate**

Run: `pnpm run build && pnpm run quality-gate`
Expected: both exit 0.

- [ ] **Step 6.8: Do NOT commit (no source changes in this task)**

Phase 3 produces evidence for the PR description, not commits. Skip the commit step.

### Task 7: Open PR with `## E2E Evidence` section

- [ ] **Step 7.1: Verify branch state**

Run: `git log --oneline main..HEAD`
Expected: 5 commits — 3 spec commits (`docs(spec): ...` ×3) + 1 rename commit + 1 cleanup commit. Plus the renamed spec file commit if not yet made.

- [ ] **Step 7.2: Stage the renamed spec + plan + tasks files**

Run: `git status`
If spec rename + plan/tasks are unstaged, run:
```bash
git add .vault/specs/2026-05-18-channel-inbound-files/
git commit -m "docs(spec): plan + tasks for channel inbound files

Adds plan-channel-inbound-files.md and tasks-channel-inbound-files.md
alongside the approved spec. Also renames spec.md to
spec-channel-inbound-files.md to match .vault/specs/_template
convention used by recent specs."
```

- [ ] **Step 7.3: Push the branch + open PR via `/new-pr`**

Per `CLAUDE.md`, never run `gh pr create` directly — use the `/new-pr` skill. Invoke `/new-pr` and pass the captured E2E evidence so the PR description's `## E2E Evidence` section is populated with:
- Slack permalinks for E1, E2, E3, E4.
- Log snippets per scenario (correlationId match shown).
- `docker exec ... ls /workspace/uploads/` outputs (each should be empty for the per-turn dir).

The PR title is `feat(channels): channel inbound files (#9)`. The body must close issue #9 with `Closes #9`.

- [ ] **Step 7.4: Verify PR rendering**

Open the PR URL returned by `/new-pr`. Confirm the `## E2E Evidence` heading renders and contains the four sub-sections (E1-E4). If anything is missing, edit the PR description via `gh pr edit <num> --body-file ...` (read the existing body first, append, then write).

---

## Phase 4: After-merge reflection (CLAUDE.md mandate)

### Task 8: Spec status flip + learnings note

**Files:**
- Modify: `.vault/specs/2026-05-18-channel-inbound-files/spec-channel-inbound-files.md` (frontmatter)
- Maybe create: `.vault/learnings/<topic>.md`

- [ ] **Step 8.1: After the PR merges, flip the spec status**

In `.vault/specs/2026-05-18-channel-inbound-files/spec-channel-inbound-files.md`, change the frontmatter:
```yaml
---
status: shipped
feature: channel-inbound-files
created: 2026-05-18
shipped: <YYYY-MM-DD>  # actual merge date
issue: https://github.com/ribeirogab/zeno-agent/issues/9
---
```

Also flip `**Status:** Draft` to `**Status:** Shipped` in the body.

- [ ] **Step 8.2: Reflect — non-obvious learnings**

Ask yourself: "What did I learn implementing this that wasn't obvious from the spec?" Candidates:
- The `wait-reaction.test.ts` `vi.mock('@slack/bolt')` listener-registry pattern is the canonical way to test the Slack adapter — document if reuse is likely.
- The `mkdir` in `downloadSlackFiles` is unconditional — surprising for an oversized-only event (covered in spec but worth a one-line learning if not already in vault).
- Any frictions hit during E2E that the spec did not anticipate.

For each genuine learning, create `.vault/learnings/<kebab-slug>.md` using `.vault/templates/learning.md`. Link back to `[[../specs/2026-05-18-channel-inbound-files/spec-channel-inbound-files]]`. Add to `.vault/_index/learnings.md`. If nothing non-obvious came up, say so explicitly in a PR comment ("No new learnings from this spec") per `CLAUDE.md`.

- [ ] **Step 8.3: Update `ROADMAP.md`**

In `ROADMAP.md`, flip the issue #9 line from:
```
- [ ] [#9](https://github.com/ribeirogab/zeno-agent/issues/9) — feat(channels): channel inbound files
```
to:
```
- [x] [#9](https://github.com/ribeirogab/zeno-agent/issues/9) — feat(channels): channel inbound files ([PR #<num>](https://github.com/ribeirogab/zeno-agent/pull/<num>))
```

- [ ] **Step 8.4: Commit + push the reflection changes (on a follow-up branch or directly per repo convention)**

Per `CLAUDE.md` Rule 20, NEVER push directly to `main`. Open a small follow-up PR if needed for the spec status + roadmap update.
