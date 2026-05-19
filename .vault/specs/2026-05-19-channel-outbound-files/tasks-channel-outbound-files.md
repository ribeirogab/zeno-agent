---
feature: channel-outbound-files
plan: "[[plan-channel-outbound-files]]"
spec: "[[spec-channel-outbound-files]]"
created: 2026-05-19
---
# Channel Outbound Files — Tasks

**For this plan:** [[plan-channel-outbound-files]]

> All commands run from the worktree root for this branch: `/Users/gabriel/.zeno/zeno-agent/.claude/worktrees/issue-10-channel-outbound-files`. Node 24 required (use `nvm use 24` if not active). `pnpm run quality-gate` is the lint + typecheck + tests gate. Never use `--no-verify`.

## Phase 0: Preflight

### Task 0: Confirm baseline green

- [ ] **Step 0.1: Confirm Node 24 is active**

Run: `node --version`
Expected: starts with `v24.`. If not: `source ~/.nvm/nvm.sh && nvm use 24`.

- [ ] **Step 0.2: Confirm baseline `pnpm run quality-gate` passes**

Run: `pnpm run quality-gate`
Expected: exit 0. If anything fails here, STOP and investigate before any edit.

- [ ] **Step 0.3: Enumerate every `Channel.send` call site and implementation**

Run: `grep -rn 'channel\.send\|\.send(target' apps/worker/src`
Expected output:
```
apps/worker/src/agent/core.ts:52:    await channel.send(target, reply);
apps/worker/src/agent/core.ts:105:        await channel.send(target, output.text);
apps/worker/src/agent/core.ts:148:            await channel.send(target, retryOutput.text);
apps/worker/src/channels/manager.ts:138:        return get().send(target, text);
apps/worker/src/cron/runner.ts:255:      await this.opts.channel.send(target, text);
```
Plus implementations:
- `apps/worker/src/channels/slack/adapter.ts` `SlackChannel.send`
- `apps/worker/src/channels/noop/noop-channel.ts` `NoopChannel.send`

If any other call sites/implementations appear, STOP and surface to the operator — the plan does not cover external consumers.

- [ ] **Step 0.4: Confirm new files do NOT exist yet**

Run:
```bash
test ! -f apps/worker/src/agent/collect-outbox.ts && \
test ! -f apps/worker/src/channels/slack/mimetype.ts && \
test ! -f apps/worker/tests/agent/collect-outbox.test.ts && \
test ! -f apps/worker/tests/channels/slack/mimetype.test.ts && \
echo OK
```
Expected: `OK`. The new files are created in later tasks.

---

## Phase 1: Types + interface signature change

### Task 1: Add `OutgoingAttachment`/`OutgoingMessage` and break `Channel.send` signature

**Files:**
- Modify: `apps/worker/src/channels/types.ts`

- [ ] **Step 1.1: Edit `apps/worker/src/channels/types.ts`**

Replace the `Channel` interface's `send` method signature:
- Find:
  ```ts
    send(target: MessageTarget, text: string): Promise<{ messageRef: string }>;
  ```
- Replace with:
  ```ts
    send(target: MessageTarget, message: OutgoingMessage): Promise<{ messageRef: string }>;
  ```

At the bottom of the file (after `MessageTarget`), append:
```ts

export interface OutgoingAttachment {
  /** Display name shown in the channel (typically the filename). */
  name: string;
  /** MIME type (inferred from extension when written by the agent's Write tool). */
  mimetype: string;
  /** Absolute path to the file on local disk (under `<workspaceDir>/outbox/<correlationId>/`). */
  localPath: string;
  /** File size in bytes. */
  sizeBytes: number;
}

export interface OutgoingMessage {
  /** Reply text, posted as the message body or as `initial_comment` alongside files. */
  text: string;
  /**
   * Optional file attachments. Omit the key entirely when there are no
   * attachments — adapters branch on `message.attachments?.length` to route
   * between text-only and file-bearing API calls.
   */
  attachments?: OutgoingAttachment[];
}
```

- [ ] **Step 1.2: Confirm typecheck fails on call sites**

Run: `cd apps/worker && pnpm exec tsc --noEmit`
Expected: 5 errors, one per call site listed in Step 0.3 plus implementations. The error message says something like `Argument of type 'string' is not assignable to parameter of type 'OutgoingMessage'.` Tasks 2-3 fix them.

- [ ] **Step 1.3: DO NOT commit yet** — the next task fixes the broken call sites so the build goes green.

### Task 2: Update `NoopChannel`, `manager.ts` proxy, `cron/runner.ts`, and `core.ts` non-outbox call sites

**Files:**
- Modify: `apps/worker/src/channels/noop/noop-channel.ts:28`
- Modify: `apps/worker/src/channels/manager.ts:137-139`
- Modify: `apps/worker/src/cron/runner.ts:255`
- Modify: `apps/worker/src/agent/core.ts:52`

- [ ] **Step 2.1: Update `NoopChannel.send` signature**

In `apps/worker/src/channels/noop/noop-channel.ts`:
- Add the import (if not already present): the import block currently is `import type { Channel, MessageHandler, MessageTarget, ReactionEvent } from '@/channels/types';` — change to `import type { Channel, MessageHandler, MessageTarget, OutgoingMessage, ReactionEvent } from '@/channels/types';`
- Replace the `send` method (line 28):
  ```ts
    async send(_target: MessageTarget, _text: string): Promise<{ messageRef: string }> {
      throw new Error('no channel installed — install Slack via dashboard /connectors and restart');
    }
  ```
- With:
  ```ts
    async send(_target: MessageTarget, _message: OutgoingMessage): Promise<{ messageRef: string }> {
      throw new Error('no channel installed — install Slack via dashboard /connectors and restart');
    }
  ```

- [ ] **Step 2.2: Update `ChannelManager.asChannel()` proxy**

In `apps/worker/src/channels/manager.ts`:
- Ensure `OutgoingMessage` is imported at the top alongside other channel types (the existing import already pulls types from `@/channels/types`; add `OutgoingMessage` to the import list).
- Replace lines 137-139:
  ```ts
        async send(target: MessageTarget, text: string) {
          return get().send(target, text);
        },
  ```
- With:
  ```ts
        async send(target: MessageTarget, message: OutgoingMessage) {
          return get().send(target, message);
        },
  ```

- [ ] **Step 2.3: Update `cron/runner.ts` `deliver()`**

In `apps/worker/src/cron/runner.ts`:
- At line 255, replace `await this.opts.channel.send(target, text);`
- With: `await this.opts.channel.send(target, { text });`

(The variable `text` is still in scope from the outer parameter.)

- [ ] **Step 2.4: Update `AgentCore.reportFailure` call site**

In `apps/worker/src/agent/core.ts`:
- At line 52, replace `await channel.send(target, reply);`
- With: `await channel.send(target, { text: reply });`

- [ ] **Step 2.5: Run typecheck — should now only fail on the two remaining outbound-aware sites**

Run: `cd apps/worker && pnpm exec tsc --noEmit`
Expected: 2 errors remaining: `apps/worker/src/agent/core.ts:105` and `apps/worker/src/agent/core.ts:148`. (Those are wired up in Task 9 alongside the outbox lifecycle.)

- [ ] **Step 2.6: Wire the two remaining sites temporarily to unblock the build**

In `apps/worker/src/agent/core.ts`, do a minimal temporary wrap so the build is green before the lifecycle task:
- Line 105: replace `await channel.send(target, output.text);` with `await channel.send(target, { text: output.text });`
- Line 148: replace `await channel.send(target, retryOutput.text);` with `await channel.send(target, { text: retryOutput.text });`

These will be revisited in Task 9 to add the `attachments` field. The minimal `{text}` form is forward-compatible.

- [ ] **Step 2.7: Run typecheck — should now be green**

Run: `cd apps/worker && pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2.8: Run quality gate**

Run: `pnpm run quality-gate`
Expected: exit 0.

- [ ] **Step 2.9: Commit phase 1**

```bash
git add apps/worker/src/channels/types.ts \
        apps/worker/src/channels/noop/noop-channel.ts \
        apps/worker/src/channels/manager.ts \
        apps/worker/src/cron/runner.ts \
        apps/worker/src/agent/core.ts
git commit -m "refactor(worker): Channel.send takes OutgoingMessage

Introduces OutgoingAttachment + OutgoingMessage types and changes
Channel.send signature from (target, text: string) to
(target, message: OutgoingMessage). All 4 call sites and 3
implementations/proxies updated atomically:

- SlackChannel.send / NoopChannel.send: signature only (body intact)
- ChannelManager.asChannel().send: proxies the new shape
- cron/runner.ts deliver(): wraps text in {text}
- AgentCore.reportFailure + primary success + resume-retry: wrap in {text}

Outbox attachments are wired in a follow-up commit. This commit is a
pure typing change; runtime behavior is byte-identical.

Refs: .vault/specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files.md"
```

---

## Phase 2: Mimetype helper

### Task 3: Create `mimetype.ts` and its test (TDD)

**Files:**
- Create: `apps/worker/tests/channels/slack/mimetype.test.ts`
- Create: `apps/worker/src/channels/slack/mimetype.ts`

- [ ] **Step 3.1: Write the failing test first**

Create `apps/worker/tests/channels/slack/mimetype.test.ts` with this exact content:

```ts
import { describe, expect, it } from 'vitest';
import { lookupMimetype } from '@/channels/slack/mimetype';

describe('lookupMimetype', () => {
  it('resolves common text extensions', () => {
    expect(lookupMimetype('a.txt')).toBe('text/plain');
    expect(lookupMimetype('b.md')).toBe('text/markdown');
    expect(lookupMimetype('c.markdown')).toBe('text/markdown');
    expect(lookupMimetype('d.json')).toBe('application/json');
    expect(lookupMimetype('e.csv')).toBe('text/csv');
    expect(lookupMimetype('f.tsv')).toBe('text/tab-separated-values');
    expect(lookupMimetype('g.html')).toBe('text/html');
    expect(lookupMimetype('h.htm')).toBe('text/html');
    expect(lookupMimetype('i.svg')).toBe('image/svg+xml');
    expect(lookupMimetype('j.xml')).toBe('application/xml');
    expect(lookupMimetype('k.yaml')).toBe('application/yaml');
    expect(lookupMimetype('l.yml')).toBe('application/yaml');
    expect(lookupMimetype('m.log')).toBe('text/plain');
  });

  it('resolves common binary extensions', () => {
    expect(lookupMimetype('a.pdf')).toBe('application/pdf');
    expect(lookupMimetype('b.png')).toBe('image/png');
    expect(lookupMimetype('c.jpg')).toBe('image/jpeg');
    expect(lookupMimetype('d.jpeg')).toBe('image/jpeg');
    expect(lookupMimetype('e.gif')).toBe('image/gif');
    expect(lookupMimetype('f.webp')).toBe('image/webp');
    expect(lookupMimetype('g.mp4')).toBe('video/mp4');
    expect(lookupMimetype('h.mp3')).toBe('audio/mpeg');
    expect(lookupMimetype('i.wav')).toBe('audio/wav');
    expect(lookupMimetype('j.ogg')).toBe('audio/ogg');
    expect(lookupMimetype('k.zip')).toBe('application/zip');
  });

  it('is case-insensitive on the extension', () => {
    expect(lookupMimetype('REPORT.JSON')).toBe('application/json');
    expect(lookupMimetype('Photo.PnG')).toBe('image/png');
  });

  it('uses application/octet-stream for unknown extensions', () => {
    expect(lookupMimetype('mystery.xyz')).toBe('application/octet-stream');
    expect(lookupMimetype('archive.tar.zst')).toBe('application/octet-stream');
  });

  it('uses application/octet-stream when no extension', () => {
    expect(lookupMimetype('README')).toBe('application/octet-stream');
    expect(lookupMimetype('.hidden')).toBe('application/octet-stream');
  });

  it('handles paths, not just bare names', () => {
    expect(lookupMimetype('/workspace/outbox/abc/data.json')).toBe('application/json');
    expect(lookupMimetype('./relative.md')).toBe('text/markdown');
  });
});
```

- [ ] **Step 3.2: Run the test — it must FAIL with "cannot find module"**

Run: `cd apps/worker && pnpm vitest run tests/channels/slack/mimetype.test.ts`
Expected: FAIL. Module resolution error for `@/channels/slack/mimetype`.

- [ ] **Step 3.3: Create the source file**

Create `apps/worker/src/channels/slack/mimetype.ts` with this exact content:

```ts
import { extname } from 'node:path';

const MIMETYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.zip': 'application/zip',
};

const FALLBACK = 'application/octet-stream';

/**
 * Map a filename or path to a MIME type by its file extension.
 *
 * Case-insensitive on the extension. Unknown extensions and files
 * without an extension fall back to `application/octet-stream`.
 */
export function lookupMimetype(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (!ext) return FALLBACK;
  return MIMETYPES[ext] ?? FALLBACK;
}
```

- [ ] **Step 3.4: Run the test — it must PASS**

Run: `cd apps/worker && pnpm vitest run tests/channels/slack/mimetype.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 3.5: Run quality gate**

Run: `pnpm run quality-gate`
Expected: exit 0.

- [ ] **Step 3.6: Commit phase 2**

```bash
git add apps/worker/src/channels/slack/mimetype.ts apps/worker/tests/channels/slack/mimetype.test.ts
git commit -m "feat(worker): inline mimetype lookup for outbound attachments

Pure function lookupMimetype(filename) maps a file extension to a
MIME type using an inline ~25-entry table covering the text/binary
shapes the agent's Write tool (plus future connectors) can plausibly
produce. Unknown / no extension falls back to application/octet-stream.

No new dependency: keeps the worker package lean and the supported
set auditable in one file.

Refs: .vault/specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files.md"
```

---

## Phase 3: `collectOutbox` helper (TDD)

### Task 4: Create `collect-outbox.ts` and its test

**Files:**
- Create: `apps/worker/tests/agent/collect-outbox.test.ts`
- Create: `apps/worker/src/agent/collect-outbox.ts`

- [ ] **Step 4.1: Write the failing test first**

Create `apps/worker/tests/agent/collect-outbox.test.ts` with this exact content:

```ts
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectOutbox } from '@/agent/collect-outbox';

describe('collectOutbox', () => {
  let outboxDir: string;

  beforeEach(() => {
    outboxDir = join(tmpdir(), `zeno-outbox-test-${randomUUID()}`);
    mkdirSync(outboxDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(outboxDir)) {
      rmSync(outboxDir, { recursive: true, force: true });
    }
  });

  it('returns [] for empty dir', async () => {
    const result = await collectOutbox(outboxDir);
    expect(result).toEqual([]);
  });

  it('returns [] when the dir does not exist', async () => {
    rmSync(outboxDir, { recursive: true, force: true });
    const result = await collectOutbox(outboxDir);
    expect(result).toEqual([]);
  });

  it('returns one attachment for one regular file', async () => {
    writeFileSync(join(outboxDir, 'places.json'), '[{"name":"x"}]');
    const result = await collectOutbox(outboxDir);
    expect(result).toEqual([
      {
        name: 'places.json',
        mimetype: 'application/json',
        localPath: join(outboxDir, 'places.json'),
        sizeBytes: 14,
      },
    ]);
  });

  it('returns multiple files sorted alphabetically by name', async () => {
    writeFileSync(join(outboxDir, 'zeta.md'), '# zeta');
    writeFileSync(join(outboxDir, 'alpha.json'), '{"a":1}');
    writeFileSync(join(outboxDir, 'mid.csv'), 'a,b\n');
    const result = await collectOutbox(outboxDir);
    expect(result.map((a) => a.name)).toEqual(['alpha.json', 'mid.csv', 'zeta.md']);
    expect(result.map((a) => a.mimetype)).toEqual([
      'application/json',
      'text/csv',
      'text/markdown',
    ]);
  });

  it('uses application/octet-stream for unknown extensions', () => {
    writeFileSync(join(outboxDir, 'mystery.xyz'), 'whatever');
    return collectOutbox(outboxDir).then((result) => {
      expect(result).toHaveLength(1);
      expect(result[0].mimetype).toBe('application/octet-stream');
    });
  });

  it('uses application/octet-stream when no extension', async () => {
    writeFileSync(join(outboxDir, 'README'), 'no ext');
    const result = await collectOutbox(outboxDir);
    expect(result).toHaveLength(1);
    expect(result[0].mimetype).toBe('application/octet-stream');
  });

  it('skips files larger than 50 MB', async () => {
    writeFileSync(join(outboxDir, 'ok.txt'), 'small');
    // Allocate 51 MB of zeros without keeping it all in V8 heap as a single string.
    const huge = Buffer.alloc(51 * 1024 * 1024);
    writeFileSync(join(outboxDir, 'huge.bin'), huge);
    const result = await collectOutbox(outboxDir);
    expect(result.map((a) => a.name)).toEqual(['ok.txt']);
  });

  it('skips subdirectories (does not recurse)', async () => {
    writeFileSync(join(outboxDir, 'top.txt'), 'top');
    mkdirSync(join(outboxDir, 'sub'));
    writeFileSync(join(outboxDir, 'sub', 'nested.txt'), 'deep');
    const result = await collectOutbox(outboxDir);
    expect(result.map((a) => a.name)).toEqual(['top.txt']);
  });

  it('skips symlinks whose realpath is outside the outbox', async () => {
    writeFileSync(join(outboxDir, 'ok.txt'), 'fine');
    // Target lives outside the outbox dir.
    const externalDir = join(tmpdir(), `zeno-external-${randomUUID()}`);
    mkdirSync(externalDir, { recursive: true });
    writeFileSync(join(externalDir, 'secret.txt'), 'private');
    try {
      symlinkSync(join(externalDir, 'secret.txt'), join(outboxDir, 'leak.txt'));
      const result = await collectOutbox(outboxDir);
      expect(result.map((a) => a.name)).toEqual(['ok.txt']);
    } finally {
      rmSync(externalDir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 4.2: Run the test — it must FAIL with "cannot find module"**

Run: `cd apps/worker && pnpm vitest run tests/agent/collect-outbox.test.ts`
Expected: FAIL. Module resolution error.

- [ ] **Step 4.3: Create the source file**

Create `apps/worker/src/agent/collect-outbox.ts` with this exact content:

```ts
import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createLogger } from '@zeno/logger';
import type { OutgoingAttachment } from '@/channels/types';
import { lookupMimetype } from '@/channels/slack/mimetype';

const logger = createLogger({ service: 'worker' });

/** Maximum file size we'll upload (50 MB). Mirrors inbound MAX_FILE_BYTES. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Enumerate files the agent wrote into the per-turn outbox directory.
 *
 * Shallow `readdir` only — subdirectories are skipped, not recursed.
 * Symlinks whose realpath escapes the outbox are skipped (defense against
 * an agent trying to leak host files via the upload surface; the agent is
 * already sandboxed in Docker but this is belt-and-suspenders).
 * Files larger than 50 MB are skipped with a warn log; the agent's reply
 * still goes through with whatever else was in the outbox.
 *
 * Missing outbox directory returns `[]` (caller may have failed `mkdir`).
 */
export async function collectOutbox(outboxDir: string): Promise<OutgoingAttachment[]> {
  let entries: string[];
  try {
    entries = await readdir(outboxDir);
  } catch (err) {
    // Dir doesn't exist or unreadable — treat as empty.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const root = resolve(outboxDir);
  const attachments: OutgoingAttachment[] = [];

  for (const name of entries.sort()) {
    const path = join(outboxDir, name);
    const lst = await lstat(path);

    if (lst.isDirectory()) {
      logger.warn(
        { event: 'outbox_subdir_skipped', name, path },
        'outbox subdirectory skipped (not recursed)',
      );
      continue;
    }

    if (lst.isSymbolicLink()) {
      const real = await realpath(path);
      if (!resolve(real).startsWith(`${root}/`) && resolve(real) !== root) {
        logger.warn(
          { event: 'outbox_symlink_skipped', name, path },
          'outbox symlink points outside dir; skipped',
        );
        continue;
      }
    }

    const st = await stat(path);
    if (!st.isFile()) {
      // Unusual (device, socket, etc.) — skip silently after the symlink check.
      continue;
    }

    if (st.size > MAX_FILE_BYTES) {
      logger.warn(
        { event: 'outbox_file_too_large', name, path, bytes: st.size },
        'outbox file exceeds 50 MB; skipped',
      );
      continue;
    }

    attachments.push({
      name,
      mimetype: lookupMimetype(name),
      localPath: path,
      sizeBytes: st.size,
    });
  }

  return attachments;
}
```

- [ ] **Step 4.4: Run the test — it must PASS**

Run: `cd apps/worker && pnpm vitest run tests/agent/collect-outbox.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 4.5: Run quality gate**

Run: `pnpm run quality-gate`
Expected: exit 0.

- [ ] **Step 4.6: Commit phase 3**

```bash
git add apps/worker/src/agent/collect-outbox.ts apps/worker/tests/agent/collect-outbox.test.ts
git commit -m "feat(worker): collectOutbox(dir) reads outbound attachments

Shallow readdir over the per-turn outbox directory, returning
OutgoingAttachment[] sorted by name. Skips subdirectories (warn
outbox_subdir_skipped), symlinks escaping the outbox (warn
outbox_symlink_skipped), and files larger than 50 MB (warn
outbox_file_too_large). Missing dir → []. Mimetype inferred from
extension via lookupMimetype.

Refs: .vault/specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files.md"
```

---

## Phase 4: `wrapWithChannelContext` outbox block (TDD)

### Task 5: Extend `wrapWithChannelContext` to accept `opts.outboxDir` and emit `[outbox]` block

**Files:**
- Modify: `apps/worker/tests/agent/wrap-context.test.ts`
- Modify: `apps/worker/src/agent/core.ts:181-220` (function body)

- [ ] **Step 5.1: Add the new tests at the bottom of the `describe` block**

Open `apps/worker/tests/agent/wrap-context.test.ts`. Immediately before the closing `});` of the describe block, insert these tests:

```ts
  it('emits [outbox] block without leading blank line when no other blocks present', () => {
    const message = makeMessage({ platform: 'discord', text: 'hi' });
    const result = wrapWithChannelContext(message, { outboxDir: '/workspace/outbox/abc' });
    expect(result).toBe(
      '[outbox]\n/workspace/outbox/abc\nWrite any file you want to send to the user into this directory. The channel adapter will upload them alongside your reply.\n[/outbox]\n\nhi',
    );
  });

  it('emits [outbox] block with leading blank-line separator after other blocks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T12:00:00.000Z'));
    try {
      const result = wrapWithChannelContext(
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
          ],
        }),
        { outboxDir: '/workspace/outbox/c1' },
      );
      expect(result).toBe(
        '[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: 2026-05-19T12:00:00.000Z\n[/slack_context]\n\n[parent_message]\ncontext\n[/parent_message]\n\n[attached_files]\n- /w/u/c1/a.png (image/png, a.png)\n[/attached_files]\nRead the attached files before responding.\n\n[outbox]\n/workspace/outbox/c1\nWrite any file you want to send to the user into this directory. The channel adapter will upload them alongside your reply.\n[/outbox]\n\ncheck these',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('omits [outbox] block when opts.outboxDir is undefined', () => {
    const message = makeMessage({ platform: 'discord', text: 'hi' });
    const result = wrapWithChannelContext(message, {});
    expect(result).toBe('hi');
    expect(result).not.toContain('[outbox]');
  });

  it('omits [outbox] block when opts.outboxDir is empty string', () => {
    const message = makeMessage({ platform: 'discord', text: 'hi' });
    const result = wrapWithChannelContext(message, { outboxDir: '' });
    expect(result).toBe('hi');
    expect(result).not.toContain('[outbox]');
  });

  it('omits [outbox] block when opts argument is missing entirely (slack parity)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T12:00:00.000Z'));
    try {
      const result = wrapWithChannelContext(makeMessage({ text: 'hello' }));
      expect(result).toBe(
        '[slack_context]\nconversation_id: C1\nthread_id: T1\nuser_id: U1\ncurrent_time: 2026-05-19T12:00:00.000Z\n[/slack_context]\n\nhello',
      );
      expect(result).not.toContain('[outbox]');
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 5.2: Run the file — new tests FAIL**

Run: `cd apps/worker && pnpm vitest run tests/agent/wrap-context.test.ts`
Expected: 5 new tests fail. Existing parity tests still pass (single-argument call still works).

- [ ] **Step 5.3: Extend `wrapWithChannelContext` signature + body in `core.ts`**

In `apps/worker/src/agent/core.ts`, locate the existing function (around lines 181-220). Replace the signature line:
```ts
export function wrapWithChannelContext(message: IncomingMessage): string {
```
with:
```ts
export function wrapWithChannelContext(
  message: IncomingMessage,
  opts: { outboxDir?: string } = {},
): string {
```

Then, immediately after the `if (message.attachments?.length) { ... }` block (which ends with `lines.push('Read the attached files before responding.');`), and BEFORE the `if (!lines.length) return message.text;` line, insert this new block:

```ts
  // Universal outbox surface: tells the agent where to write files for upload.
  if (opts.outboxDir) {
    if (lines.length) lines.push('');
    lines.push('[outbox]');
    lines.push(opts.outboxDir);
    lines.push(
      'Write any file you want to send to the user into this directory. The channel adapter will upload them alongside your reply.',
    );
    lines.push('[/outbox]');
  }
```

- [ ] **Step 5.4: Run the test file — all tests must PASS**

Run: `cd apps/worker && pnpm vitest run tests/agent/wrap-context.test.ts`
Expected: every test (existing + 5 new) passes.

- [ ] **Step 5.5: Run quality gate**

Run: `pnpm run quality-gate`
Expected: exit 0.

- [ ] **Step 5.6: Commit phase 4**

```bash
git add apps/worker/src/agent/core.ts apps/worker/tests/agent/wrap-context.test.ts
git commit -m "feat(worker): wrapWithChannelContext emits [outbox] block

wrapWithChannelContext now accepts an optional opts.outboxDir.
When set, appends an [outbox] block (universal, platform-agnostic)
that tells the agent where to write files for upload. Mirrors the
[attached_files] block convention: separated by a blank line from
prior blocks; no leading whitespace when no prior blocks.

Single-argument calls still work (slack parity preserved).

Refs: .vault/specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files.md"
```

---

## Phase 5: `AgentCore.bind` outbox lifecycle (TDD)

### Task 6: Create `apps/worker/tests/agent/core.test.ts` with lifecycle tests

**Files:**
- Create OR extend: `apps/worker/tests/agent/core.test.ts`

> If `apps/worker/tests/agent/core.test.ts` already exists, append the new `describe` block at the bottom (do NOT clobber). The Step 6.1 check determines this.

- [ ] **Step 6.1: Check whether the file exists**

Run: `test -f apps/worker/tests/agent/core.test.ts && echo EXISTS || echo NEW`

If `EXISTS`: append the `describe('AgentCore.bind — outbox lifecycle', ...)` block below to the bottom of the file (before any trailing whitespace).
If `NEW`: create the file with the imports at the top + the describe block.

- [ ] **Step 6.2: Write the test block**

The exact block (regardless of new vs append):

```ts
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mkdirMock = vi.fn();
const rmMock = vi.fn();

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    mkdir: (...args: unknown[]) => mkdirMock(...args),
    rm: (...args: unknown[]) => rmMock(...args),
  };
});

const collectOutboxMock = vi.fn();
vi.mock('@/agent/collect-outbox', () => ({
  collectOutbox: (...args: unknown[]) => collectOutboxMock(...args),
}));

const { AgentCore } = await import('@/agent/core');

interface MockChannel {
  name: string;
  send: ReturnType<typeof vi.fn>;
  react: ReturnType<typeof vi.fn>;
  unreact: ReturnType<typeof vi.fn>;
  waitForReaction: ReturnType<typeof vi.fn>;
  openDm: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

function makeChannel(): MockChannel {
  return {
    name: 'slack',
    send: vi.fn().mockResolvedValue({ messageRef: 'ts-1' }),
    react: vi.fn().mockResolvedValue(undefined),
    unreact: vi.fn().mockResolvedValue(undefined),
    waitForReaction: vi.fn().mockResolvedValue(null),
    openDm: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function makeMessage(overrides: Partial<Parameters<typeof Object>[0]> = {}) {
  return {
    platform: 'slack',
    userId: 'U1',
    conversationId: 'C1',
    threadId: 'T1',
    text: 'hello',
    correlationId: `corr-${randomUUID()}`,
    messageRef: 'ts-orig',
    raw: {},
    ...overrides,
  };
}

const sessionRepoStub = {
  get: vi.fn().mockReturnValue(null),
  upsert: vi.fn(),
  delete: vi.fn(),
};

describe('AgentCore.bind — outbox lifecycle', () => {
  beforeEach(() => {
    mkdirMock.mockReset().mockResolvedValue(undefined);
    rmMock.mockReset().mockResolvedValue(undefined);
    collectOutboxMock.mockReset().mockResolvedValue([]);
    sessionRepoStub.get.mockReset().mockReturnValue(null);
    sessionRepoStub.upsert.mockReset();
    sessionRepoStub.delete.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates outbox dir, collects after backend, passes attachments to send, cleans up', async () => {
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi.fn().mockResolvedValue({ text: 'reply', sessionId: 'sess-1' }),
    };
    collectOutboxMock.mockResolvedValue([
      {
        name: 'places.json',
        mimetype: 'application/json',
        localPath: `/ws/outbox/${message.correlationId}/places.json`,
        sizeBytes: 12,
      },
    ]);

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    });
    await core.bind(channel as never)(message as never);

    expect(mkdirMock).toHaveBeenCalledWith(`/ws/outbox/${message.correlationId}`, {
      recursive: true,
    });
    expect(backend.query).toHaveBeenCalledOnce();
    expect(collectOutboxMock).toHaveBeenCalledWith(`/ws/outbox/${message.correlationId}`);
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'slack', conversationId: 'C1' }),
      expect.objectContaining({
        text: 'reply',
        attachments: expect.arrayContaining([expect.objectContaining({ name: 'places.json' })]),
      }),
    );
    expect(rmMock).toHaveBeenCalledWith(`/ws/outbox/${message.correlationId}`, {
      recursive: true,
      force: true,
    });
  });

  it('omits attachments key when outbox is empty', async () => {
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi.fn().mockResolvedValue({ text: 'no files', sessionId: 'sess-2' }),
    };
    collectOutboxMock.mockResolvedValue([]);

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    });
    await core.bind(channel as never)(message as never);

    expect(channel.send).toHaveBeenCalledOnce();
    const sendArgs = channel.send.mock.calls[0];
    const outgoing = sendArgs[1] as Record<string, unknown>;
    expect(outgoing).toEqual({ text: 'no files' });
    expect(outgoing).not.toHaveProperty('attachments');
  });

  it('cleans outbox dir after backend.query throws (reportFailure path)', async () => {
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi.fn().mockRejectedValue(new Error('boom')),
    };

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    });
    await core.bind(channel as never)(message as never);

    expect(rmMock).toHaveBeenCalledWith(`/ws/outbox/${message.correlationId}`, {
      recursive: true,
      force: true,
    });
    // reportFailure must NOT include attachments — error replies are text-only.
    const lastSend = channel.send.mock.calls.at(-1);
    if (lastSend) {
      const outgoing = lastSend[1] as Record<string, unknown>;
      expect(outgoing).not.toHaveProperty('attachments');
    }
  });

  it('mkdir failure proceeds without outbox surface and skips cleanup', async () => {
    mkdirMock.mockRejectedValueOnce(new Error('disk full'));
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi.fn().mockResolvedValue({ text: 'reply', sessionId: 'sess-3' }),
    };

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    });
    await core.bind(channel as never)(message as never);

    expect(backend.query).toHaveBeenCalledOnce();
    expect(collectOutboxMock).not.toHaveBeenCalled();
    expect(rmMock).not.toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledOnce();
  });

  it('cleanup failure is swallowed; dispatch resolves cleanly', async () => {
    rmMock.mockRejectedValueOnce(new Error('cleanup boom'));
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi.fn().mockResolvedValue({ text: 'reply', sessionId: 'sess-4' }),
    };

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    });
    await expect(core.bind(channel as never)(message as never)).resolves.toBeUndefined();
    expect(rmMock).toHaveBeenCalledOnce();
  });

  it('session-resume retry path also collects + sends attachments', async () => {
    sessionRepoStub.get.mockReturnValue('stale-session-id');
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi
        .fn()
        // First call (resume attempt) fails with the resume-failure pattern.
        .mockRejectedValueOnce(new Error('No conversation found with session ID: stale-session-id'))
        // Second call (retry) succeeds.
        .mockResolvedValueOnce({ text: 'retry reply', sessionId: 'sess-new' }),
    };
    collectOutboxMock.mockResolvedValue([
      {
        name: 'late.json',
        mimetype: 'application/json',
        localPath: `/ws/outbox/${message.correlationId}/late.json`,
        sizeBytes: 5,
      },
    ]);

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    });
    await core.bind(channel as never)(message as never);

    expect(backend.query).toHaveBeenCalledTimes(2);
    expect(collectOutboxMock).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledOnce();
    const outgoing = channel.send.mock.calls[0][1] as Record<string, unknown>;
    expect(outgoing).toMatchObject({
      text: 'retry reply',
      attachments: expect.arrayContaining([expect.objectContaining({ name: 'late.json' })]),
    });
    expect(rmMock).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 6.3: Run the file — most tests FAIL**

Run: `cd apps/worker && pnpm vitest run tests/agent/core.test.ts`
Expected: all 6 outbox tests fail (mkdir not called, collectOutbox not called, etc.). This is correct — Task 7 wires the lifecycle.

- [ ] **Step 6.4: DO NOT commit yet** — proceed to Task 7.

### Task 7: Wire outbox lifecycle into `AgentCore.bind`

**Files:**
- Modify: `apps/worker/src/agent/core.ts:65-164` (`bind` method body)
- Modify: `apps/worker/src/agent/core.ts:1-7` (imports)

- [ ] **Step 7.1: Add imports**

At the top of `apps/worker/src/agent/core.ts`, add these two imports above the existing imports:
```ts
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
```

And add this import (kept separate to match existing grouping with `@/` paths):
```ts
import { collectOutbox } from '@/agent/collect-outbox';
```

- [ ] **Step 7.2: Replace the `bind` method body**

Replace the entire `bind` method (currently starting around line 65 with `bind(channel: Channel): (msg: IncomingMessage) => Promise<void> {` and ending with the matching closing brace around line 164) with this body:

```ts
  bind(channel: Channel): (msg: IncomingMessage) => Promise<void> {
    return async (message: IncomingMessage) => {
      const target: MessageTarget = {
        platform: message.platform,
        conversationId: message.conversationId,
        threadId: message.threadId,
        messageRef: message.messageRef,
      };

      await safe(() => channel.react(target, 'eyes'));

      const outboxDir = join(this.opts.workspaceDir, 'outbox', message.correlationId);
      let outboxReady = false;
      try {
        await mkdir(outboxDir, { recursive: true });
        outboxReady = true;
        logger.info(
          { event: 'outbox_created', correlationId: message.correlationId, path: outboxDir },
          'outbox dir ready',
        );
      } catch (err) {
        logger.error(
          {
            event: 'outbox_mkdir_failed',
            correlationId: message.correlationId,
            path: outboxDir,
            err: String(err).slice(0, 200),
          },
          'failed to create outbox dir; proceeding without outbox surface',
        );
      }

      try {
        const resumeSessionId = message.threadId
          ? (this.opts.sessions.get(message.threadId) ?? undefined)
          : undefined;

        const agentInput: AgentInput = {
          systemPrompt: this.opts.getSystemPrompt(),
          userMessage: wrapWithChannelContext(message, {
            outboxDir: outboxReady ? outboxDir : undefined,
          }),
          cwd: this.opts.workspaceDir,
          correlationId: message.correlationId,
          persistSession: message.threadId == null ? false : undefined,
          resumeSessionId,
        };

        if (resumeSessionId) {
          logger.info(
            {
              event: 'session_resumed',
              correlationId: message.correlationId,
              threadId: message.threadId,
              sessionId: resumeSessionId,
            },
            'resuming session',
          );
        }

        let replyText: string;
        let replySessionId: string | undefined;
        try {
          const output = await this.opts.backend.query(agentInput);
          replyText = output.text;
          replySessionId = output.sessionId;
        } catch (firstError) {
          if (resumeSessionId && isResumeFailure(firstError)) {
            if (message.threadId) this.opts.sessions.delete(message.threadId);
            logger.warn(
              {
                event: 'session_resume_failed',
                correlationId: message.correlationId,
                threadId: message.threadId,
                staleSessionId: resumeSessionId,
              },
              'stale session, starting fresh',
            );
            try {
              const retryOutput = await this.opts.backend.query({
                ...agentInput,
                resumeSessionId: undefined,
              });
              replyText = retryOutput.text;
              replySessionId = retryOutput.sessionId;
            } catch (retryError) {
              await this.reportFailure(channel, target, message.correlationId, retryError);
              return;
            }
          } else {
            await this.reportFailure(channel, target, message.correlationId, firstError);
            return;
          }
        }

        const attachments = outboxReady ? await collectOutbox(outboxDir) : [];
        if (outboxReady) {
          logger.info(
            {
              event: 'outbox_collected',
              correlationId: message.correlationId,
              path: outboxDir,
              count: attachments.length,
              totalBytes: attachments.reduce((sum, a) => sum + a.sizeBytes, 0),
            },
            'outbox collected',
          );
        }

        const outgoing: OutgoingMessage =
          attachments.length > 0 ? { text: replyText, attachments } : { text: replyText };

        await channel.send(target, outgoing);
        await safe(() => channel.unreact(target, 'eyes'));
        await safe(() => channel.react(target, 'white_check_mark'));

        if (message.threadId && replySessionId) {
          const wasNew = this.opts.sessions.get(message.threadId) === null;
          this.opts.sessions.upsert(message.threadId, replySessionId);
          if (wasNew) {
            logger.info(
              {
                event: 'session_created',
                correlationId: message.correlationId,
                threadId: message.threadId,
                sessionId: replySessionId,
              },
              'session created',
            );
          }
        }

        logger.info(
          { event: 'response_sent', correlationId: message.correlationId },
          'response sent',
        );
      } finally {
        if (outboxReady) {
          try {
            await rm(outboxDir, { recursive: true, force: true });
            logger.info(
              { event: 'outbox_cleaned', correlationId: message.correlationId, path: outboxDir },
              'outbox cleaned',
            );
          } catch (err) {
            logger.warn(
              {
                event: 'outbox_cleanup_failed',
                correlationId: message.correlationId,
                path: outboxDir,
                err: String(err).slice(0, 200),
              },
              'failed to clean outbox dir',
            );
          }
        }
      }
    };
  }
```

- [ ] **Step 7.3: Add `OutgoingMessage` to the types import**

The existing import is `import type { Channel, IncomingMessage, MessageTarget } from '@/channels/types';`. Change to:
```ts
import type { Channel, IncomingMessage, MessageTarget, OutgoingMessage } from '@/channels/types';
```

- [ ] **Step 7.4: Run the core test file — must PASS**

Run: `cd apps/worker && pnpm vitest run tests/agent/core.test.ts`
Expected: all 6 outbox lifecycle tests pass.

- [ ] **Step 7.5: Run wrap-context tests + collect-outbox tests for regression**

Run: `cd apps/worker && pnpm vitest run tests/agent/`
Expected: every test in the agent suite passes.

- [ ] **Step 7.6: Run full quality gate**

Run: `pnpm run quality-gate`
Expected: exit 0.

- [ ] **Step 7.7: Commit phase 5**

```bash
git add apps/worker/src/agent/core.ts apps/worker/tests/agent/core.test.ts
git commit -m "feat(worker): AgentCore.bind owns per-turn outbox lifecycle

bind() now:
- mkdir <workspaceDir>/outbox/<correlationId>/ before invoking backend
- emits outbox_created (or outbox_mkdir_failed on mkdir error;
  continues without outbox surface)
- passes outboxDir into wrapWithChannelContext so the agent learns
  where to write files
- runs collectOutbox after backend.query (primary or resume-retry)
- emits outbox_collected with count + totalBytes
- channel.send wraps reply in {text, attachments} (omits attachments
  key when collectOutbox returned [])
- finally: rm -rf outbox dir; emits outbox_cleaned, or
  outbox_cleanup_failed (warn, swallowed)
- reportFailure path sends {text: reply} with no attachments
  (error replies are text-only by design)

Tested via 6 new lifecycle units in apps/worker/tests/agent/core.test.ts.

Refs: .vault/specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files.md"
```

---

## Phase 6: `SlackChannel.send` outbound branching (TDD)

### Task 8: Add outbound `send` tests to `apps/worker/tests/channels/slack/adapter.test.ts`

**Files:**
- Modify: `apps/worker/tests/channels/slack/adapter.test.ts`

- [ ] **Step 8.1: Inspect the existing mock app shape**

Run: `head -100 apps/worker/tests/channels/slack/adapter.test.ts`
Confirm the file uses `vi.mock('@slack/bolt', ...)` with a fake `App` exposing `client.chat.postMessage`. The `send` tests reuse this `mockAppRef.current.client.chat.postMessage` and ADD `mockAppRef.current.client.files.uploadV2`.

- [ ] **Step 8.2: Extend the mock client to include `files.uploadV2`**

In `apps/worker/tests/channels/slack/adapter.test.ts`, find the `MockClient` interface (currently has `conversations`, `chat`, `reactions`, `auth`). Add a `files` field:
```ts
interface MockClient {
  conversations: { open: ReturnType<typeof vi.fn>; replies: ReturnType<typeof vi.fn> };
  chat: { postMessage: ReturnType<typeof vi.fn> };
  files: { uploadV2: ReturnType<typeof vi.fn> };
  reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  auth: { test: ReturnType<typeof vi.fn> };
}
```

And inside the `App` constructor body in the `vi.mock('@slack/bolt', ...)` factory, add an entry to `this.client` for `files`:
```ts
        chat: { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1234.5678' }) },
        files: { uploadV2: vi.fn() },
        reactions: { add: vi.fn(), remove: vi.fn() },
```
(adjust the existing line if `chat.postMessage` did not have a default resolved value; the regression test below expects `{ok:true, ts:...}`.)

- [ ] **Step 8.3: Append the new describe block at the bottom of the file**

Add at the bottom (before the final `});` if any, or just at end-of-file):

```ts
describe('SlackChannel.send — outbound files', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = join(tmpdir(), `zeno-slack-send-${randomUUID()}`);
    mkdirSync(workspaceDir, { recursive: true });
    mockAppRef.current = null;
  });

  afterEach(() => {
    if (existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  function writeFixture(name: string, body: string): string {
    const path = join(workspaceDir, name);
    writeFileSync(path, body);
    return path;
  }

  async function start(): Promise<{ channel: InstanceType<typeof SlackChannel>; client: MockClient }> {
    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    await channel.start(vi.fn().mockResolvedValue(undefined));
    const client = mockAppRef.current!.client;
    return { channel, client };
  }

  it('text-only routes to chat.postMessage (no uploadV2)', async () => {
    const { channel, client } = await start();
    const result = await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: 'T1' },
      { text: 'hi there' },
    );
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    expect(client.files.uploadV2).not.toHaveBeenCalled();
    expect(result.messageRef).toBe('1234.5678');
  });

  it('text + 1 attachment routes to files.uploadV2 with initial_comment + thread_ts', async () => {
    const path = writeFixture('places.json', '[{"a":1}]');
    const { channel, client } = await start();
    client.files.uploadV2.mockResolvedValue({
      ok: true,
      files: [
        {
          id: 'F1',
          shares: { public: { C1: [{ ts: '1700000000.000001' }] } },
        },
      ],
    });

    const result = await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: 'T1' },
      {
        text: 'segue o arquivo',
        attachments: [
          { name: 'places.json', mimetype: 'application/json', localPath: path, sizeBytes: 8 },
        ],
      },
    );

    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(client.files.uploadV2).toHaveBeenCalledOnce();
    const args = client.files.uploadV2.mock.calls[0][0];
    expect(args.channel_id).toBe('C1');
    expect(args.thread_ts).toBe('T1');
    expect(args.initial_comment).toBeTruthy();
    expect(Array.isArray(args.file_uploads)).toBe(true);
    expect(args.file_uploads).toHaveLength(1);
    expect(args.file_uploads[0].filename).toBe('places.json');
    expect(args.file_uploads[0].title).toBe('places.json');
    expect(result.messageRef).toBe('1700000000.000001');
  });

  it('text + 2 attachments uploads both in one files.uploadV2 call', async () => {
    const p1 = writeFixture('one.md', '# one');
    const p2 = writeFixture('two.csv', 'a,b\n');
    const { channel, client } = await start();
    client.files.uploadV2.mockResolvedValue({
      ok: true,
      files: [{ id: 'F1', shares: { public: { C1: [{ ts: '1700000000.000002' }] } } }],
    });

    await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: 'T1' },
      {
        text: 't',
        attachments: [
          { name: 'one.md', mimetype: 'text/markdown', localPath: p1, sizeBytes: 5 },
          { name: 'two.csv', mimetype: 'text/csv', localPath: p2, sizeBytes: 4 },
        ],
      },
    );

    expect(client.files.uploadV2).toHaveBeenCalledOnce();
    expect(client.files.uploadV2.mock.calls[0][0].file_uploads).toHaveLength(2);
  });

  it('empty text + 1 attachment omits initial_comment', async () => {
    const path = writeFixture('only.txt', 'hello');
    const { channel, client } = await start();
    client.files.uploadV2.mockResolvedValue({
      ok: true,
      files: [{ id: 'F1', shares: { public: { C1: [{ ts: '1700000000.000003' }] } } }],
    });

    await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: null },
      {
        text: '',
        attachments: [
          { name: 'only.txt', mimetype: 'text/plain', localPath: path, sizeBytes: 5 },
        ],
      },
    );

    const args = client.files.uploadV2.mock.calls[0][0];
    expect(args.initial_comment).toBeUndefined();
  });

  it('uploadV2 failure falls back to chat.postMessage with warning suffix', async () => {
    const path = writeFixture('rep.json', '{}');
    const { channel, client } = await start();
    client.files.uploadV2.mockRejectedValue(new Error('not_allowed_token_type'));

    const result = await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: 'T1' },
      {
        text: 'reply text',
        attachments: [
          { name: 'rep.json', mimetype: 'application/json', localPath: path, sizeBytes: 2 },
        ],
      },
    );

    expect(client.files.uploadV2).toHaveBeenCalledOnce();
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    const fallbackArgs = client.chat.postMessage.mock.calls[0][0];
    expect(fallbackArgs.text).toContain('reply text');
    expect(fallbackArgs.text).toContain('file upload failed');
    expect(result.messageRef).toBe('1234.5678');
  });

  it('messageRef from private channel share when public share is missing', async () => {
    const path = writeFixture('p.json', '{}');
    const { channel, client } = await start();
    client.files.uploadV2.mockResolvedValue({
      ok: true,
      files: [{ id: 'F1', shares: { private: { C1: [{ ts: '1700000000.000004' }] } } }],
    });

    const result = await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: null },
      {
        text: 'x',
        attachments: [
          { name: 'p.json', mimetype: 'application/json', localPath: path, sizeBytes: 2 },
        ],
      },
    );
    expect(result.messageRef).toBe('1700000000.000004');
  });

  it('files.uploadV2 returning no shares ts throws "files.uploadV2 returned no message ts"', async () => {
    const path = writeFixture('q.json', '{}');
    const { channel, client } = await start();
    client.files.uploadV2.mockResolvedValue({ ok: true, files: [{ id: 'F1' }] });

    await expect(
      channel.send(
        { platform: 'slack', conversationId: 'C1', threadId: null },
        {
          text: 'x',
          attachments: [
            { name: 'q.json', mimetype: 'application/json', localPath: path, sizeBytes: 2 },
          ],
        },
      ),
    ).rejects.toThrow('files.uploadV2 returned no message ts');
  });
});
```

- [ ] **Step 8.4: Run the file — new tests FAIL**

Run: `cd apps/worker && pnpm vitest run tests/channels/slack/adapter.test.ts`
Expected: the 7 new tests fail (adapter not yet updated). Existing cleanup tests from #9 still pass.

- [ ] **Step 8.5: DO NOT commit yet** — Task 9 wires the adapter.

### Task 9: Wire `SlackChannel.send` branching in `apps/worker/src/channels/slack/adapter.ts`

**Files:**
- Modify: `apps/worker/src/channels/slack/adapter.ts:1-10` (imports)
- Modify: `apps/worker/src/channels/slack/adapter.ts:171-195` (`send` method)

- [ ] **Step 9.1: Confirm the Bolt SDK version supports `client.files.uploadV2`**

Run: `pnpm list @slack/bolt`
Expected: `4.x` or newer. If older, STOP and surface — the spec assumes `client.files.uploadV2`.

Also read the SDK's `uploadV2` signature once for sanity:
```bash
grep -rn 'uploadV2' node_modules/@slack/web-api/dist/types/request/files.d.ts 2>/dev/null || \
  grep -rn 'uploadV2' node_modules/@slack/web-api/dist 2>/dev/null | head -5
```
Confirm the accepted args include `channel_id`, `thread_ts`, `initial_comment`, `file_uploads`.

- [ ] **Step 9.2: Add imports**

At the top of `apps/worker/src/channels/slack/adapter.ts`, add:
```ts
import { createReadStream } from 'node:fs';
```

And replace the existing types import to pull in `OutgoingMessage`:
```ts
import type { Channel, MessageHandler, MessageTarget, OutgoingMessage, ReactionEvent } from '@/channels/types';
```

- [ ] **Step 9.3: Replace the `send` method body**

Find the current `send` method (around line 171):
```ts
  async send(target: MessageTarget, text: string): Promise<{ messageRef: string }> {
    if (target.platform !== 'slack') {
      throw new Error(`Unsupported platform: ${target.platform}`);
    }
    const result = await this.app.client.chat.postMessage({
      token: this.opts.botToken,
      channel: target.conversationId,
      thread_ts: target.threadId ?? undefined,
      text: toSlackMrkdwn(text),
    });
    if (!result.ts) {
      throw new Error('chat.postMessage returned no ts');
    }
    return { messageRef: String(result.ts) };
  }
```

Replace with:
```ts
  async send(target: MessageTarget, message: OutgoingMessage): Promise<{ messageRef: string }> {
    if (target.platform !== 'slack') {
      throw new Error(`Unsupported platform: ${target.platform}`);
    }

    // Text-only fast path — unchanged from pre-#10 behavior.
    if (!message.attachments?.length) {
      const result = await this.app.client.chat.postMessage({
        token: this.opts.botToken,
        channel: target.conversationId,
        thread_ts: target.threadId ?? undefined,
        text: toSlackMrkdwn(message.text),
      });
      if (!result.ts) {
        throw new Error('chat.postMessage returned no ts');
      }
      return { messageRef: String(result.ts) };
    }

    // With attachments: single files.uploadV2 call combining text + files.
    const initialComment = toSlackMrkdwn(message.text) || undefined;
    try {
      const result = await this.app.client.files.uploadV2({
        token: this.opts.botToken,
        channel_id: target.conversationId,
        thread_ts: target.threadId ?? undefined,
        initial_comment: initialComment,
        file_uploads: message.attachments.map((a) => ({
          file: createReadStream(a.localPath),
          filename: a.name,
          title: a.name,
        })),
      });

      const fileShares = (result as { files?: Array<{ shares?: { public?: Record<string, Array<{ ts?: string }>>; private?: Record<string, Array<{ ts?: string }>> } }> }).files?.[0]?.shares;
      const ts =
        fileShares?.public?.[target.conversationId]?.[0]?.ts ??
        fileShares?.private?.[target.conversationId]?.[0]?.ts;
      if (!ts) {
        throw new Error('files.uploadV2 returned no message ts');
      }
      logger.info(
        {
          event: 'slack_files_uploaded',
          channel: target.conversationId,
          count: message.attachments.length,
          totalBytes: message.attachments.reduce((sum, a) => sum + a.sizeBytes, 0),
          ts,
        },
        'files uploaded to slack',
      );
      return { messageRef: ts };
    } catch (error) {
      if (error instanceof Error && error.message === 'files.uploadV2 returned no message ts') {
        throw error;
      }
      logger.error(
        { event: 'slack_files_upload_failed', channel: target.conversationId, err: String(error).slice(0, 200) },
        'files.uploadV2 failed; falling back to text-only postMessage',
      );
      const fallback = await this.app.client.chat.postMessage({
        token: this.opts.botToken,
        channel: target.conversationId,
        thread_ts: target.threadId ?? undefined,
        text: `${toSlackMrkdwn(message.text)}\n\n_(file upload failed — check worker logs)_`,
      });
      if (!fallback.ts) {
        throw new Error('chat.postMessage (fallback) returned no ts');
      }
      return { messageRef: String(fallback.ts) };
    }
  }
```

- [ ] **Step 9.4: Run the adapter tests — all must PASS**

Run: `cd apps/worker && pnpm vitest run tests/channels/slack/adapter.test.ts`
Expected: all 5 (existing) + 7 (new) = 12 tests pass.

- [ ] **Step 9.5: Run full quality gate**

Run: `pnpm run quality-gate`
Expected: exit 0. No lint warnings.

- [ ] **Step 9.6: Commit phase 6**

```bash
git add apps/worker/src/channels/slack/adapter.ts apps/worker/tests/channels/slack/adapter.test.ts
git commit -m "feat(slack): outbound files via files.uploadV2

SlackChannel.send now branches on message.attachments?.length:

- No attachments: existing chat.postMessage path (byte-identical).
- With attachments: single client.files.uploadV2 call with
  channel_id, thread_ts, initial_comment (toSlackMrkdwn(text) or
  undefined when text is empty), and file_uploads: [{file:
  createReadStream(localPath), filename, title}, ...].
- messageRef from the first file's shares.public[channel][0].ts
  (or shares.private when posted in a private DM).
- uploadV2 failure (e.g., bot missing files:write scope) falls back
  to chat.postMessage with a '\\n\\n_(file upload failed — check
  worker logs)_' suffix so the operator still sees the agent reply.

Seven new tests in apps/worker/tests/channels/slack/adapter.test.ts
cover routing, args shape, message-ref extraction, and fallback.

Refs: .vault/specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files.md"
```

---

## Phase 7: Slack manifest update

### Task 10: Add `files:write` to bot scopes

**Files:**
- Modify: `infra/slack-app-manifest.json`

- [ ] **Step 10.1: Edit the manifest**

In `infra/slack-app-manifest.json`, find the `oauth_config.scopes.bot` array. Currently contains `files:read` (added in #9) alongside `channels:history`, `chat:write`, etc. Add `"files:write"` to the array, preserving alphabetical or existing ordering (insert next to `files:read`).

After the edit, the relevant block looks like:
```json
      "bot": [
        "channels:history",
        "chat:write",
        "app_mentions:read",
        "files:read",
        "files:write",
        "groups:history",
        ...
```

- [ ] **Step 10.2: Verify the JSON is still valid**

Run: `python3 -c 'import json; json.load(open("infra/slack-app-manifest.json"))' && echo OK`
Expected: `OK`.

- [ ] **Step 10.3: Run quality gate**

Run: `pnpm run quality-gate`
Expected: exit 0.

- [ ] **Step 10.4: Commit phase 7**

```bash
git add infra/slack-app-manifest.json
git commit -m "chore(infra): add files:write scope to slack manifest

Required for SlackChannel.send's files.uploadV2 path (outbound
attachments). Operator must reinstall the Slack app for the new
scope to take effect; until then uploadV2 returns
not_allowed_token_type and the adapter falls back to text-only
postMessage with a visible failure suffix.

Refs: .vault/specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files.md"
```

---

## Phase 8: E2E gate against `C0B0GLS5UTB`

### Task 11: Operator reinstall + E1 + E2 + E3

**Files:** (no source edits in this task)

> **Operator action required FIRST:** in Slack app config (api.slack.com/apps), open the zeno-agent app → "Install App" → "Re-install to Workspace" for `flavianasser.slack.com` → confirm the `files:write` scope is requested → re-grant. The bot token does NOT change but the new scope takes effect.

- [ ] **Step 11.1: Rebuild + restart the profile container**

Run: `pnpm run build && zeno restart <profile-name>`
Replace `<profile-name>` with the operator's profile (the one with the Slack bot installed in `flavianasser.slack.com`). Wait for `zeno logs <profile> --tail 10` to show the boot completion.

- [ ] **Step 11.2: Run E1 (JSON artifact)**

In Slack web/desktop, send in channel `C0B0GLS5UTB`:
```
@zeno crie um JSON com meus 3 lugares favoritos e me manda como arquivo
```

Verify within 30 seconds:
- Bot reply appears in the same thread with a `.json` attachment.
- Downloading the file yields valid JSON (3 entries, fields like `name`/`city`).
- Run: `zeno logs <profile> --tail 80 | grep -E 'outbox_|slack_files_'`
  - Confirm in order: `outbox_created`, `outbox_collected count:1`, `slack_files_uploaded count:1`, `outbox_cleaned`. All with the same `correlationId`.
- Run: `docker exec $(docker ps --filter "name=<profile>" -q) ls /workspace/outbox/`
  - Confirm the per-turn `correlationId` directory is absent.

Capture for PR:
- Slack message permalink (right-click → "Copy link to message").
- Grep'd log lines.
- `docker exec ls` output.

- [ ] **Step 11.3: Run E2 (Markdown report)**

Send:
```
@zeno escreve um resumo do projeto Zeno em markdown e me manda como arquivo .md
```

Verify within 30 seconds:
- Bot reply contains a `.md` attachment whose body parses as Markdown (at least one `#` heading).
- Slack inline preview renders the markdown.
- Mimetype reported by Slack on the file metadata is `text/markdown` (right-click file → "Get info" or use `files.info` via Slack API to verify; the worker logs `slack_files_uploaded` carries the count/bytes but not the mimetype, so this verification is Slack-side).
- Same log + `docker exec ls` verification as E1.

Capture same artifacts.

- [ ] **Step 11.4: Run E3 (text-only regression)**

Send:
```
@zeno responde só com texto, sem arquivo nenhum
```

Verify:
- Bot reply is plain text in the thread with ZERO attachments.
- Run: `zeno logs <profile> --tail 80 | grep -E 'outbox_|slack_files_'`
  - Confirm: `outbox_created`, `outbox_collected count:0`, `outbox_cleaned`. There is NO `slack_files_uploaded` line.
- `docker exec ls /workspace/outbox/` shows the per-turn dir is absent.

Capture artifacts.

- [ ] **Step 11.5: Quality gate (sanity, no source change)**

Run: `pnpm run quality-gate`
Expected: exit 0.

- [ ] **Step 11.6: Do NOT commit (no source changes in this task)**

Phase 8 produces evidence for the PR description, not commits.

---

## Phase 9: PR + reflection

### Task 12: Open PR with `## E2E Evidence` section

- [ ] **Step 12.1: Verify branch state**

Run: `git log --oneline origin/main..HEAD`
Expected: commits, in order:
1. `refactor(worker): Channel.send takes OutgoingMessage`
2. `feat(worker): inline mimetype lookup for outbound attachments`
3. `feat(worker): collectOutbox(dir) reads outbound attachments`
4. `feat(worker): wrapWithChannelContext emits [outbox] block`
5. `feat(worker): AgentCore.bind owns per-turn outbox lifecycle`
6. `feat(slack): outbound files via files.uploadV2`
7. `chore(infra): add files:write scope to slack manifest`

Plus the spec/plan/tasks commits (next step).

- [ ] **Step 12.2: Stage and commit the spec + plan + tasks**

Run: `git status`
If the spec/plan/tasks are unstaged, run:
```bash
git add .vault/specs/2026-05-19-channel-outbound-files/
git commit -m "docs(spec): spec + plan + tasks for channel outbound files

Adds spec-channel-outbound-files.md (reviewer-approved 2026-05-19),
plan-channel-outbound-files.md, and tasks-channel-outbound-files.md.
Mirrors the structure of the shipped inbound spec
(2026-05-18-channel-inbound-files).

Refs: https://github.com/ribeirogab/zeno-agent/issues/10"
```

- [ ] **Step 12.3: Push the branch + open PR via `/new-pr`**

Per `CLAUDE.md`, never run `gh pr create` directly — use the `/new-pr` skill. Invoke `/new-pr` and pass the captured E2E evidence so the PR description's `## E2E Evidence` section is populated with:
- Slack permalinks for E1, E2, E3.
- Log snippets per scenario (correlationId match shown).
- `docker exec ls /workspace/outbox/` outputs (empty for each per-turn dir).

The PR title is `feat(channels): channel outbound files (#10)`. The body must close issue #10 with `Closes #10`.

Also include an "Operator action required" block:
> Reinstall the Slack app to grant the new `files:write` scope. Until reinstall, `client.files.uploadV2` will fail and the adapter will fall back to text-only postMessage with a `_(file upload failed — check worker logs)_` suffix.

- [ ] **Step 12.4: Verify PR rendering**

Open the PR URL returned by `/new-pr`. Confirm the `## E2E Evidence` heading renders and contains the three sub-sections (E1, E2, E3) plus the Operator-action block.

---

## Phase 10: After-merge reflection (CLAUDE.md mandate)

### Task 13: Spec status flip + learnings notes

**Files:**
- Modify: `.vault/specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files.md` (frontmatter)
- Maybe create: `.vault/learnings/<topic>.md`

- [ ] **Step 13.1: After the PR merges, flip the spec status**

In `.vault/specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files.md`, change the frontmatter:
```yaml
---
status: shipped
feature: channel-outbound-files
created: 2026-05-19
shipped: <YYYY-MM-DD>  # actual merge date
issue: https://github.com/ribeirogab/zeno-agent/issues/10
---
```

Also flip `**Status:** Ready (reviewer approved 2026-05-19)` to `**Status:** Shipped`.

- [ ] **Step 13.2: Reflect — non-obvious learnings**

Ask yourself: "What did I learn implementing this that wasn't obvious from the spec?" Candidates:
- Bolt SDK `files.uploadV2` response shape — where the `ts` lives (shares.public[channel][0].ts) and how the SDK normalizes single vs multi-file uploads. Worth a learning if the response is differently shaped than the spec assumed.
- Reinstall friction: operator forgot the new scope and uploadV2 failed silently in production — captured by the fallback, but worth a learning if it surprised anyone.
- Any test-mocking gotchas with the new `node:fs/promises` + `collect-outbox` + `core` mock setup. The pattern from #9 (vi.mock with factory + override) should hold; document deviations.
- Any frictions hit during E2E that the spec did not anticipate.

For each genuine learning, create `.vault/learnings/<kebab-slug>.md` using `.vault/templates/learning.md`. Link back to `[[../specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files]]`. Add to `.vault/_index/learnings.md`. If nothing non-obvious came up, say so explicitly in a PR comment ("No new learnings from this spec") per `CLAUDE.md`.

- [ ] **Step 13.3: Update `ROADMAP.md`**

In `ROADMAP.md`, flip the issue #10 line from:
```
- [ ] [#10](https://github.com/ribeirogab/zeno-agent/issues/10) — feat(channels): channel outbound files
```
to:
```
- [x] [#10](https://github.com/ribeirogab/zeno-agent/issues/10) — feat(channels): channel outbound files ([PR #<num>](https://github.com/ribeirogab/zeno-agent/pull/<num>))
```

- [ ] **Step 13.4: Commit + push the reflection changes**

Per `CLAUDE.md` Rule 20, NEVER push directly to `main`. Open a small follow-up PR if needed for the spec status + roadmap update.
