# CLI UX Overhaul — Tasks

> **For agentic workers:** execute tasks in order. Each task is self-contained: write test → run (fail) → implement → run (pass) → commit. The full quality gate runs at the end of each phase, not every task. Spec lives at [spec.md](./spec.md). Plan at [plan.md](./plan.md).

## Conventions

- **TDD:** every task that adds runtime behaviour starts with a failing test.
- **Commits:** Conventional Commits format. Subject under 72 chars. No `Co-Authored-By` lines (project rule 19).
- **Test runner:** `pnpm --filter @zeno/cli test -- <pattern>` for CLI; `pnpm --filter @zeno/api test -- <pattern>` for API.
- **Type checker:** `pnpm --filter @zeno/cli typecheck` after non-trivial type edits.
- **No quality gate per task** — runs at end of each phase. Local `tsc --noEmit` and targeted vitest are enough during a task.

---

## Phase 1 — Foundation modules

### Task 1: `lib/version-meta.ts` + tests (Q5, A2)

**Files:**
- Create: `apps/cli/src/lib/version-meta.ts`
- Create: `apps/cli/tests/lib/version-meta.test.ts`

**Step 1.1 — Write the failing tests**

```ts
// apps/cli/tests/lib/version-meta.test.ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/paths.js', () => ({
  ZENO_HOME: '/__test_home_placeholder__',
}));

import * as paths from '../../src/lib/paths.js';
import {
  compareSemver,
  formatDisplay,
  readMeta,
  writeMeta,
  type VersionMeta,
} from '../../src/lib/version-meta.js';

describe('version-meta', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'zeno-vm-'));
    (paths as { ZENO_HOME: string }).ZENO_HOME = tmp;
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('writeMeta + readMeta roundtrip', () => {
    const cases: VersionMeta[] = [
      { kind: 'tag', value: 'v2026.5.7', sha: 'a1b2c3d' },
      { kind: 'branch', value: 'feat/foo', sha: 'a1b2c3d' },
      { kind: 'pr', value: '123', sha: 'a1b2c3d' },
      { kind: 'unstable', value: '', sha: 'a1b2c3d' },
    ];

    for (const meta of cases) {
      it(`roundtrips ${meta.kind}:${meta.value}`, () => {
        writeMeta(meta);
        expect(readMeta()).toEqual(meta);
      });
    }

    it('writes the documented line format', () => {
      writeMeta({ kind: 'tag', value: 'v2026.5.7', sha: 'a1b2c3d' });
      const content = readFileSync(join(tmp, '.installed-from'), 'utf8').trim();
      expect(content).toBe('tag:v2026.5.7@a1b2c3d');
    });

    it('reads a line written by install.sh', () => {
      writeFileSync(join(tmp, '.installed-from'), 'pr:123@a1b2c3d\n');
      expect(readMeta()).toEqual({ kind: 'pr', value: '123', sha: 'a1b2c3d' });
    });
  });

  describe('readMeta', () => {
    it('returns null when the file is absent', () => {
      expect(readMeta()).toBeNull();
    });
  });

  describe('formatDisplay', () => {
    const cases: Array<[VersionMeta, string]> = [
      [{ kind: 'tag', value: 'v2026.5.7', sha: 'a1b2c3d' }, 'v2026.5.7'],
      [{ kind: 'branch', value: 'feat/foo', sha: 'a1b2c3d' }, 'branch:feat/foo (a1b2c3d)'],
      [{ kind: 'pr', value: '123', sha: 'a1b2c3d' }, 'pr:#123 (a1b2c3d)'],
      [{ kind: 'unstable', value: '', sha: 'a1b2c3d' }, 'unstable (a1b2c3d)'],
    ];
    for (const [meta, expected] of cases) {
      it(`renders ${meta.kind} as ${expected}`, () => {
        expect(formatDisplay(meta)).toBe(expected);
      });
    }
  });

  describe('compareSemver', () => {
    it('newer minor returns positive', () => {
      expect(compareSemver('v2026.5.10', 'v2026.5.9')).toBeGreaterThan(0);
    });
    it('older minor returns negative', () => {
      expect(compareSemver('v2026.5.9', 'v2026.5.10')).toBeLessThan(0);
    });
    it('hyphen suffix sorts after base', () => {
      expect(compareSemver('v2026.5.9-1', 'v2026.5.9')).toBeGreaterThan(0);
    });
    it('equal versions return zero', () => {
      expect(compareSemver('v2026.5.9', 'v2026.5.9')).toBe(0);
    });
    it('handles missing v prefix', () => {
      expect(compareSemver('2026.5.10', 'v2026.5.9')).toBeGreaterThan(0);
    });
  });
});
```

**Step 1.2 — Run tests (expect failures, no module yet)**

```bash
pnpm --filter @zeno/cli test -- lib/version-meta
```

Expected: tests fail with `Cannot find module './version-meta'` or similar.

**Step 1.3 — Implement the module**

```ts
// apps/cli/src/lib/version-meta.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZENO_HOME } from './paths.js';

export type VersionKind = 'tag' | 'branch' | 'pr' | 'unstable';
export interface VersionMeta {
  kind: VersionKind;
  value: string;
  sha: string;
}

const META_PATH = () => join(ZENO_HOME, '.installed-from');

export function writeMeta(meta: VersionMeta): void {
  const line = `${meta.kind}:${meta.value}@${meta.sha}\n`;
  writeFileSync(META_PATH(), line, 'utf8');
}

export function readMeta(): VersionMeta | null {
  const path = META_PATH();
  if (!existsSync(path)) return null;
  const line = readFileSync(path, 'utf8').trim();
  const colonIdx = line.indexOf(':');
  const atIdx = line.lastIndexOf('@');
  if (colonIdx < 0 || atIdx < 0 || atIdx < colonIdx) return null;
  const kind = line.slice(0, colonIdx) as VersionKind;
  if (!['tag', 'branch', 'pr', 'unstable'].includes(kind)) return null;
  const value = line.slice(colonIdx + 1, atIdx);
  const sha = line.slice(atIdx + 1);
  return { kind, value, sha };
}

export function formatDisplay(meta: VersionMeta): string {
  switch (meta.kind) {
    case 'tag':
      return meta.value;
    case 'branch':
      return `branch:${meta.value} (${meta.sha})`;
    case 'pr':
      return `pr:#${meta.value} (${meta.sha})`;
    case 'unstable':
      return `unstable (${meta.sha})`;
  }
}

export function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split(/[.-]/).map((p) => parseInt(p, 10) || 0);
  const ap = parse(a);
  const bp = parse(b);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
```

**Step 1.4 — Run tests (expect pass)**

```bash
pnpm --filter @zeno/cli test -- lib/version-meta
```

Expected: all green.

**Step 1.5 — Commit**

```bash
git add apps/cli/src/lib/version-meta.ts apps/cli/tests/lib/version-meta.test.ts
git commit -m "feat(cli): add version-meta lib for .installed-from + semver"
```

---

### Task 2: `lib/prompt.ts` + tests (A1, E2)

**Files:**
- Create: `apps/cli/src/lib/prompt.ts`
- Create: `apps/cli/tests/lib/prompt.test.ts`

**Step 2.1 — Write the failing tests**

```ts
// apps/cli/tests/lib/prompt.test.ts
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { confirm, confirmDestructive, promptHidden } from '../../src/lib/prompt.js';

function fakeIO() {
  const stdin = new PassThrough() as PassThrough & { isTTY: boolean; setRawMode: (v: boolean) => void };
  const stdout = new PassThrough() as PassThrough & { isTTY: boolean };
  stdin.isTTY = true;
  stdout.isTTY = true;
  stdin.setRawMode = vi.fn();
  return { stdin, stdout };
}

describe('promptHidden', () => {
  it('emits only the label to stdout (no echo)', async () => {
    const { stdin, stdout } = fakeIO();
    const writes: string[] = [];
    stdout.on('data', (b: Buffer) => writes.push(b.toString()));
    const p = promptHidden('secret', undefined, { stdin, stdout });
    setImmediate(() => stdin.write('hello\n'));
    expect(await p).toBe('hello');
    expect(writes.join('')).toBe('secret: \n');
  });

  it('handles a 64-char paste in a single buffer write', async () => {
    const { stdin, stdout } = fakeIO();
    const value = 'a'.repeat(64);
    const p = promptHidden('s', undefined, { stdin, stdout });
    setImmediate(() => stdin.write(`${value}\n`));
    expect(await p).toBe(value);
  });

  it('exits with non-TTY stdin', async () => {
    const { stdin, stdout } = fakeIO();
    stdin.isTTY = false;
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await expect(promptHidden('s', undefined, { stdin, stdout })).rejects.toBeDefined().catch(() => {});
    expect(exit).toHaveBeenCalledWith(1);
    exit.mockRestore();
  });
});

describe('confirmDestructive', () => {
  it('returns true when --yes is set', async () => {
    expect(await confirmDestructive('do it?', { yes: true })).toBe(true);
  });

  it('returns false in non-TTY without --yes', async () => {
    const { stdin } = fakeIO();
    stdin.isTTY = false;
    expect(await confirmDestructive('do it?', { yes: false }, { stdin })).toBe(false);
  });

  it('delegates to confirm() in TTY without --yes', async () => {
    const { stdin, stdout } = fakeIO();
    const p = confirmDestructive('do it?', { yes: false }, { stdin, stdout });
    setImmediate(() => stdin.write('y\n'));
    expect(await p).toBe(true);
  });
});

describe('confirm', () => {
  it('parses y / Y / yes as true', async () => {
    for (const input of ['y\n', 'Y\n', 'yes\n']) {
      const { stdin, stdout } = fakeIO();
      const p = confirm('?', { stdin, stdout });
      setImmediate(() => stdin.write(input));
      expect(await p).toBe(true);
    }
  });
  it('parses n / empty as false', async () => {
    for (const input of ['n\n', '\n']) {
      const { stdin, stdout } = fakeIO();
      const p = confirm('?', { stdin, stdout });
      setImmediate(() => stdin.write(input));
      expect(await p).toBe(false);
    }
  });
});
```

**Step 2.2 — Run tests (expect failures)**

```bash
pnpm --filter @zeno/cli test -- lib/prompt
```

**Step 2.3 — Implement**

```ts
// apps/cli/src/lib/prompt.ts
import type { Readable, Writable } from 'node:stream';
import { c, err } from './output.js';

interface IO {
  stdin?: NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (v: boolean) => void };
  stdout?: NodeJS.WritableStream;
}

const defaultIO = (): Required<IO> => ({
  stdin: process.stdin,
  stdout: process.stdout,
});

export async function promptHidden(label: string, help?: string, io: IO = {}): Promise<string> {
  const { stdin, stdout } = { ...defaultIO(), ...io };
  if (!stdin.isTTY) {
    process.stderr.write(err('secret value required but stdin is not a TTY. pass via --secret KEY=VALUE\n'));
    process.exit(1);
  }
  if (help) stdout.write(`${c.dim(help)}\n`);
  stdout.write(`${label}: `);
  stdin.setRawMode?.(true);
  if ('resume' in stdin && typeof stdin.resume === 'function') stdin.resume();
  return new Promise<string>((resolve) => {
    let value = '';
    const onData = (chunk: Buffer) => {
      const data = chunk.toString();
      for (const ch of data) {
        if (ch === '\n' || ch === '\r') {
          stdin.removeListener('data', onData);
          stdin.setRawMode?.(false);
          if ('pause' in stdin && typeof stdin.pause === 'function') stdin.pause();
          stdout.write('\n');
          return resolve(value.trim());
        }
        if (ch === '') {
          process.exit(130);
        }
        if (ch === '') {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

export async function confirm(prompt: string, io: IO = {}): Promise<boolean> {
  const { stdin, stdout } = { ...defaultIO(), ...io };
  stdout.write(`${prompt} `);
  if ('resume' in stdin && typeof stdin.resume === 'function') stdin.resume();
  return new Promise<boolean>((resolve) => {
    const onData = (chunk: Buffer) => {
      const reply = chunk.toString().trim().toLowerCase();
      stdin.removeListener('data', onData);
      if ('pause' in stdin && typeof stdin.pause === 'function') stdin.pause();
      resolve(reply === 'y' || reply === 'yes');
    };
    stdin.on('data', onData);
  });
}

export async function confirmDestructive(
  prompt: string,
  args: { yes?: boolean },
  io: IO = {},
): Promise<boolean> {
  if (args.yes) return true;
  const { stdin } = { ...defaultIO(), ...io };
  if (!stdin.isTTY) {
    process.stderr.write(err('destructive operation requires --yes in non-interactive mode\n'));
    return false;
  }
  return confirm(prompt, io);
}
```

**Step 2.4 — Run tests (expect pass)**

```bash
pnpm --filter @zeno/cli test -- lib/prompt
```

**Step 2.5 — Commit**

```bash
git add apps/cli/src/lib/prompt.ts apps/cli/tests/lib/prompt.test.ts
git commit -m "feat(cli): add prompt lib (hidden secret input + destructive confirm)"
```

---

### Task 3: `lib/errors.ts` + tests (E3)

**Files:**
- Create: `apps/cli/src/lib/errors.ts`
- Create: `apps/cli/tests/lib/errors.test.ts`

**Step 3.1 — Write the failing tests**

```ts
// apps/cli/tests/lib/errors.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/lib/api-client.js';
import { friendly, runCommand } from '../../src/lib/errors.js';

const apiErr = (status: number, body: unknown) =>
  new ApiError(status, body, `${status} ${JSON.stringify(body)}`);

describe('friendly', () => {
  it('maps single_instance_catalog_already_installed', () => {
    const e = apiErr(409, { error: 'single_instance_catalog_already_installed', catalogId: 'playwright', slug: 'playwright' });
    const h = friendly(e);
    expect(h.msg).toBe('playwright already installed (single-instance)');
    expect(h.hint).toBe('uninstall first: zeno connector uninstall playwright');
  });

  it('maps auth_failed', () => {
    const e = apiErr(401, { error: 'auth_failed', detail: 'invalid token', slug: 'linear-acme', key: '__MCP_AUTHORIZATION__' });
    const h = friendly(e);
    expect(h.msg).toContain('auth failed');
    expect(h.hint).toContain('zeno connector secret set linear-acme');
  });

  it('falls back to raw message for unknown codes', () => {
    const e = apiErr(500, { error: 'something_unknown' });
    expect(friendly(e).msg).toContain('500');
  });
});

describe('runCommand', () => {
  it('runs the function and returns the value when no throw', async () => {
    expect(await runCommand(async () => 42)).toBe(42);
  });

  it('catches ApiError, prints friendly + exits 1', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await runCommand(async () => {
      throw apiErr(409, { error: 'single_instance_catalog_already_installed', catalogId: 'playwright', slug: 'playwright' });
    });
    expect(exit).toHaveBeenCalledWith(1);
    const out = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('playwright already installed');
    expect(out).toContain('uninstall first');
    exit.mockRestore();
    stderr.mockRestore();
  });

  it('rethrows non-ApiError', async () => {
    await expect(runCommand(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });
});
```

**Step 3.2 — Run tests (expect failures)**

**Step 3.3 — Implement**

```ts
// apps/cli/src/lib/errors.ts
import { ApiError } from './api-client.js';
import { c, err } from './output.js';

export interface Hint {
  msg: string;
  hint?: string;
}

type MapEntry = (e: ApiError) => Hint;

const map: Record<string, MapEntry> = {
  single_instance_catalog_already_installed: (e) => {
    const body = (e.body ?? {}) as { catalogId?: string; slug?: string };
    return {
      msg: `${body.catalogId ?? 'connector'} already installed (single-instance)`,
      hint: `uninstall first: zeno connector uninstall ${body.slug ?? body.catalogId ?? '<slug>'}`,
    };
  },
  auth_failed: (e) => {
    const body = (e.body ?? {}) as { detail?: string; slug?: string; key?: string };
    return {
      msg: `auth failed (${body.detail ?? 'upstream rejected token'})`,
      hint: body.slug && body.key
        ? `rotate token: zeno connector secret set ${body.slug} ${body.key}`
        : undefined,
    };
  },
  rate_limited: (e) => {
    const body = (e.body ?? {}) as { retryAfter?: number };
    return {
      msg: 'rate limited',
      hint: body.retryAfter ? `retry after ${body.retryAfter}s` : undefined,
    };
  },
  app_already_installed: (e) => {
    const body = (e.body ?? {}) as { catalogId?: string };
    return {
      msg: `app catalog ${body.catalogId ?? ''} already installed`,
      hint: `uninstall first: zeno connector app uninstall`,
    };
  },
};

export function friendly(e: ApiError): Hint {
  const body = (e.body ?? {}) as { error?: string };
  const code = body.error ?? '';
  return map[code]?.(e) ?? { msg: e.message };
}

export async function runCommand<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      const { msg, hint } = friendly(e);
      process.stderr.write(`${err(msg)}\n`);
      if (hint) process.stderr.write(`${c.gray(`  → ${hint}`)}\n`);
      process.exit(1);
    }
    throw e;
  }
}
```

**Step 3.4 — Run tests (expect pass)**

```bash
pnpm --filter @zeno/cli test -- lib/errors
```

**Step 3.5 — Commit**

```bash
git add apps/cli/src/lib/errors.ts apps/cli/tests/lib/errors.test.ts
git commit -m "feat(cli): add errors lib (friendly mapping + runCommand)"
```

---

### Task 4: `lib/output.ts` quiet support (E4)

**Files:**
- Modify: `apps/cli/src/lib/output.ts`

**Step 4.1 — Add `--quiet` aware singletons**

Replace the body of `apps/cli/src/lib/output.ts` with the following (preserve the existing color helpers):

```ts
// apps/cli/src/lib/output.ts
let quietMode = false;
let colorEnabled = process.stdout.isTTY && process.env.NO_COLOR !== '1';

export function setQuiet(v: boolean): void {
  quietMode = v;
  if (v) colorEnabled = false;
}
export function isQuiet(): boolean {
  return quietMode;
}

const code = (open: string, close: string) =>
  colorEnabled ? (s: string) => `\x1b[${open}m${s}\x1b[${close}m` : (s: string) => s;

export const c = {
  reset: code('0', '0'),
  bold: code('1', '22'),
  dim: code('2', '22'),
  gray: code('90', '39'),
  red: code('31', '39'),
  green: code('32', '39'),
  yellow: code('33', '39'),
  blue: code('34', '39'),
  cyan: code('36', '39'),
  gold: code('38;5;220', '39'),
};

export const ok = (s: string) => (quietMode ? '' : `${c.green('✓')} ${s}`);
export const warn = (s: string) => (quietMode ? '' : `${c.yellow('!')} ${s}`);
export const err = (s: string) => `${c.red('✗')} ${s}`;
export const info = (s: string) => (quietMode ? '' : `${c.blue('i')} ${s}`);

export type Status = 'running' | 'stopped' | 'failed';

export function statusDot(status: Status): string {
  if (status === 'running') return c.green('●');
  if (status === 'stopped') return c.gray('○');
  return c.red('✗');
}

export function statusLabel(status: Status): string {
  if (status === 'running') return c.green('running');
  if (status === 'stopped') return c.gray('stopped');
  return c.red('failed');
}

export function formatUptime(startedAtMs: number | null): string {
  if (!startedAtMs) return '-';
  const ms = Date.now() - startedAtMs;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatTime(ms: number | null): string {
  if (!ms) return c.gray('never');
  return `${new Date(ms).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

export function rule(width = 50): string {
  return c.gray('─'.repeat(width));
}
```

**Step 4.2 — Update `lib/spinner.ts` to honour `setQuiet`**

Inspect `apps/cli/src/lib/spinner.ts`. Wrap the spinner's frame output in `if (isQuiet()) return await fn(); ... ` so that when quiet, the function runs without animation:

```ts
import { isQuiet } from './output.js';
// ...
export async function spin<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (isQuiet()) return fn();
  // existing animation logic preserved
  // ...
}
```

**Step 4.3 — Manual smoke**

```bash
pnpm --filter @zeno/cli typecheck
```

Expected: pass.

**Step 4.4 — Commit**

```bash
git add apps/cli/src/lib/output.ts apps/cli/src/lib/spinner.ts
git commit -m "feat(cli): output + spinner honour --quiet flag"
```

---

### Task 5: `lib/resolvers.ts` + tests (D, Q1)

**Files:**
- Create: `apps/cli/src/lib/resolvers.ts`
- Create: `apps/cli/tests/lib/resolvers.test.ts`

**Step 5.1 — Write the failing tests**

```ts
// apps/cli/tests/lib/resolvers.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/state.js', () => ({
  db: () => ({}),
}));
vi.mock('@zeno/db/host', () => ({
  queries: {
    listProfiles: vi.fn(),
    findProfile: vi.fn(),
    getSticky: vi.fn(),
  },
}));
vi.mock('../../src/lib/picker.js', () => ({
  pick: vi.fn(),
}));

import { queries } from '@zeno/db/host';
import { pick } from '../../src/lib/picker.js';
import {
  resolveCatalog,
  resolveConnector,
  resolveProfile,
  resolveSecretKey,
  resolveTool,
  resolvePermission,
} from '../../src/lib/resolvers.js';

const tty = (v: boolean) => {
  Object.defineProperty(process.stdin, 'isTTY', { value: v, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: v, configurable: true });
};

describe('resolveProfile', () => {
  it('returns the profile when a name is passed', async () => {
    (queries.findProfile as ReturnType<typeof vi.fn>).mockReturnValue({ name: 'fn', port: 6101 });
    expect((await resolveProfile('fn')).name).toBe('fn');
  });

  it('returns the sticky when no arg and sticky exists', async () => {
    (queries.getSticky as ReturnType<typeof vi.fn>).mockReturnValue('fn');
    (queries.findProfile as ReturnType<typeof vi.fn>).mockReturnValue({ name: 'fn', port: 6101 });
    expect((await resolveProfile(undefined)).name).toBe('fn');
  });

  it('opens picker when no arg + no sticky + multiple profiles in TTY', async () => {
    tty(true);
    (queries.getSticky as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (queries.listProfiles as ReturnType<typeof vi.fn>).mockReturnValue([
      { name: 'fn', port: 6101, status: 'running' },
      { name: 'work', port: 6102, status: 'stopped' },
    ]);
    (pick as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    expect((await resolveProfile(undefined)).name).toBe('fn');
  });

  it('exits 1 when no arg + no sticky + non-TTY', async () => {
    tty(false);
    (queries.getSticky as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await resolveProfile(undefined).catch(() => {});
    expect(exit).toHaveBeenCalledWith(1);
    exit.mockRestore();
  });

  it('uses single profile + emits hint when only one exists, no sticky', async () => {
    tty(true);
    (queries.getSticky as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (queries.listProfiles as ReturnType<typeof vi.fn>).mockReturnValue([{ name: 'only', port: 6101 }]);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    expect((await resolveProfile(undefined)).name).toBe('only');
    expect(stdout.mock.calls.map((c) => String(c[0])).join('')).toContain('zeno profile use only');
    stdout.mockRestore();
  });
});

describe('resolveConnector', () => {
  it('returns the slug when passed', async () => {
    expect(await resolveConnector('linear-acme', { listConnectors: async () => [] })).toBe('linear-acme');
  });

  it('opens picker over the API list when missing in TTY', async () => {
    tty(true);
    (pick as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    const slug = await resolveConnector(undefined, {
      listConnectors: async () => [{ slug: 'linear-acme', displayName: 'Linear (Acme)' }],
    });
    expect(slug).toBe('linear-acme');
  });
});

describe('resolvePermission', () => {
  it('returns the value when valid', async () => {
    expect(await resolvePermission('ask')).toBe('ask');
  });

  it('throws on invalid value', async () => {
    await expect(resolvePermission('invalid' as 'ask')).rejects.toThrow();
  });

  it('opens a 3-option picker when missing in TTY', async () => {
    tty(true);
    (pick as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    expect(await resolvePermission(undefined)).toBe('ask');
  });
});
```

(Add similar focused tests for `resolveCatalog`, `resolveSecretKey`, `resolveTool` — each follows the same pattern: arg-passed → returned, missing+TTY → picker.)

**Step 5.2 — Run tests (expect failures)**

**Step 5.3 — Implement**

```ts
// apps/cli/src/lib/resolvers.ts
import type { ProfileRow } from '@zeno/db/host';
import { queries } from '@zeno/db/host';
import { c, err, isQuiet, statusLabel, type Status } from './output.js';
import { pick } from './picker.js';
import { db } from './state.js';

const isTTY = () => !!process.stdin.isTTY && !!process.stdout.isTTY;

export async function resolveProfile(arg: string | undefined): Promise<ProfileRow> {
  const conn = db();
  if (arg) {
    const p = queries.findProfile(conn, arg);
    if (!p) {
      process.stderr.write(`${err(`profile '${arg}' not found`)}\n`);
      process.exit(1);
    }
    return p;
  }
  const sticky = queries.getSticky(conn);
  if (sticky) {
    const p = queries.findProfile(conn, sticky);
    if (p) return p;
  }
  const profiles = queries.listProfiles(conn);
  if (profiles.length === 0) {
    process.stderr.write(`${err('no profiles. create one: zeno profile create <name>')}\n`);
    process.exit(1);
  }
  if (profiles.length === 1) {
    const only = profiles[0];
    if (!isQuiet()) {
      process.stdout.write(`${c.dim(`tip: zeno profile use ${only.name}`)}\n`);
    }
    return only;
  }
  if (!isTTY()) {
    process.stderr.write(`${err('no profile specified. use --profile <name>')}\n`);
    process.exit(1);
  }
  const items = profiles.map((p) => ({
    label: p.name,
    hint: statusLabel((p.status ?? 'stopped') as Status),
  }));
  const idx = await pick(items, { title: `${c.bold('select profile')}  ${c.gray('↑/↓ + Enter')}` });
  if (idx === null) {
    process.stderr.write(`${err('aborted')}\n`);
    process.exit(1);
  }
  const chosen = profiles[idx];
  if (!isQuiet()) {
    process.stdout.write(`${c.dim(`tip: zeno profile use ${chosen.name} → skip picker next time`)}\n`);
  }
  return chosen;
}

interface ConnectorListItem { slug: string; displayName?: string }
interface ConnectorListSource {
  listConnectors: () => Promise<ConnectorListItem[]>;
}

export async function resolveConnector(
  arg: string | undefined,
  src: ConnectorListSource,
): Promise<string> {
  if (arg) return arg;
  if (!isTTY()) {
    process.stderr.write(`${err('no connector specified. pass <slug>')}\n`);
    process.exit(1);
  }
  const list = await src.listConnectors();
  if (list.length === 0) {
    process.stderr.write(`${err('no connectors installed')}\n`);
    process.exit(1);
  }
  const idx = await pick(
    list.map((c) => ({ label: c.slug, hint: c.displayName ?? '' })),
    { title: `${c.bold('select connector')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) {
    process.stderr.write(`${err('aborted')}\n`);
    process.exit(1);
  }
  return list[idx].slug;
}

interface CatalogEntry { id: string; displayName?: string; multiInstance?: boolean }
interface CatalogSource { listCatalog: () => Promise<CatalogEntry[]> }

export async function resolveCatalog(
  arg: string | undefined,
  src: CatalogSource,
): Promise<string> {
  if (arg) return arg;
  if (!isTTY()) {
    process.stderr.write(`${err('no catalog id specified. pass <id>')}\n`);
    process.exit(1);
  }
  const list = await src.listCatalog();
  const idx = await pick(
    list.map((e) => ({ label: e.id, hint: e.displayName ?? '' })),
    { title: `${c.bold('select catalog entry')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) {
    process.stderr.write(`${err('aborted')}\n`);
    process.exit(1);
  }
  return list[idx].id;
}

interface SecretKeyItem { key: string; label?: string }
interface SecretSource { listSecrets: () => Promise<SecretKeyItem[]> }

export async function resolveSecretKey(
  arg: string | undefined,
  src: SecretSource,
): Promise<string> {
  if (arg) return arg;
  if (!isTTY()) {
    process.stderr.write(`${err('no secret key specified.')}\n`);
    process.exit(1);
  }
  const list = await src.listSecrets();
  const idx = await pick(
    list.map((k) => ({ label: k.key, hint: k.label ?? '' })),
    { title: `${c.bold('select secret key')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) {
    process.stderr.write(`${err('aborted')}\n`);
    process.exit(1);
  }
  return list[idx].key;
}

interface ToolItem { name: string; description?: string }
interface ToolSource { listTools: () => Promise<ToolItem[]> }

export async function resolveTool(
  arg: string | undefined,
  src: ToolSource,
): Promise<string> {
  if (arg) return arg;
  if (!isTTY()) {
    process.stderr.write(`${err('no tool specified.')}\n`);
    process.exit(1);
  }
  const list = await src.listTools();
  const idx = await pick(
    list.map((t) => ({ label: t.name, hint: t.description ?? '' })),
    { title: `${c.bold('select tool')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) {
    process.stderr.write(`${err('aborted')}\n`);
    process.exit(1);
  }
  return list[idx].name;
}

export type Permission = 'always_allow' | 'ask' | 'never';
const PERMISSIONS: Permission[] = ['always_allow', 'ask', 'never'];

export async function resolvePermission(arg: string | undefined): Promise<Permission> {
  if (arg) {
    if (!PERMISSIONS.includes(arg as Permission)) {
      throw new Error(`invalid permission '${arg}'. use one of: ${PERMISSIONS.join(', ')}`);
    }
    return arg as Permission;
  }
  if (!isTTY()) {
    process.stderr.write(`${err('no permission specified. pass one of: always_allow | ask | never')}\n`);
    process.exit(1);
  }
  const idx = await pick(
    PERMISSIONS.map((p) => ({ label: p, hint: '' })),
    { title: `${c.bold('select permission')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) {
    process.stderr.write(`${err('aborted')}\n`);
    process.exit(1);
  }
  return PERMISSIONS[idx];
}
```

**Step 5.4 — Run tests + typecheck**

```bash
pnpm --filter @zeno/cli test -- lib/resolvers
pnpm --filter @zeno/cli typecheck
```

**Step 5.5 — Phase-1 quality gate + commit**

```bash
pnpm run quality-gate
git add apps/cli/src/lib/resolvers.ts apps/cli/tests/lib/resolvers.test.ts
git commit -m "feat(cli): add resolvers lib (typed picker fallback per arg)"
```

---

## Phase 2 — Security / correctness

### Task 6: A1 — wire `promptHidden` into connector secret commands

**Files:**
- Modify: `apps/cli/src/commands/connector-install.ts`
- Modify: `apps/cli/src/commands/connector-secret-set.ts`
- Modify: `apps/cli/src/commands/connector-secret-rotate.ts`
- Modify: `apps/cli/tests/commands/connector-install.test.ts`
- Modify: `apps/cli/tests/commands/connector-secret.test.ts`

**Step 6.1 — Update tests to assert `promptHidden` usage and absence of stdout echo**

In each affected test file, replace any mock of `readline.createInterface` with a mock of `promptHidden`:

```ts
vi.mock('../../src/lib/prompt.js', () => ({
  promptHidden: vi.fn(async (_label: string) => 'mock-secret'),
}));
import { promptHidden } from '../../src/lib/prompt.js';
```

Add an assertion in each existing prompt-flow test that `promptHidden` was called and `readline.question` was NOT.

**Step 6.2 — Run tests (expect failures because the code still uses readline)**

**Step 6.3 — Replace `promptSecret` in each command**

In `apps/cli/src/commands/connector-install.ts`, delete the `promptSecret` function (lines 81-90). Replace its single caller:

```ts
import { promptHidden } from '../lib/prompt.js';
// ...
const value = provided[sec.key] ?? (await promptHidden(sec.label ?? sec.key, sec.help));
```

In `apps/cli/src/commands/connector-secret-set.ts`, replace the existing readline prompt with `promptHidden(args.key)`.

In `apps/cli/src/commands/connector-secret-rotate.ts`, replace each readline call inside the `for` loop with `promptHidden(spec.label ?? spec.key, spec.help)`.

**Step 6.4 — Run tests (expect pass)**

```bash
pnpm --filter @zeno/cli test -- connector-install connector-secret
```

**Step 6.5 — Commit**

```bash
git add apps/cli/src/commands/connector-install.ts \
        apps/cli/src/commands/connector-secret-set.ts \
        apps/cli/src/commands/connector-secret-rotate.ts \
        apps/cli/tests/commands/connector-install.test.ts \
        apps/cli/tests/commands/connector-secret.test.ts
git commit -m "fix(cli): use hidden prompt for secret values (no terminal echo)"
```

---

### Task 7: A2 — wire `compareSemver` into `commands/upgrade.ts`

**Files:**
- Modify: `apps/cli/src/commands/upgrade.ts`
- Create: `apps/cli/tests/commands/upgrade-semver.test.ts`

**Step 7.1 — Add a test that asserts the downgrade guard uses semver compare, not string compare**

```ts
// apps/cli/tests/commands/upgrade-semver.test.ts
import { describe, expect, it } from 'vitest';
import { compareSemver } from '../../src/lib/version-meta.js';

describe('downgrade guard semantics', () => {
  it('v2026.5.10 → v2026.5.9 is a downgrade (positive then negative)', () => {
    expect(compareSemver('v2026.5.10', 'v2026.5.9')).toBeGreaterThan(0);
    // current=v2026.5.10, target=v2026.5.9 → target<current → downgrade detected
    const current = 'v2026.5.10';
    const target = 'v2026.5.9';
    expect(compareSemver(target, current)).toBeLessThan(0);
  });
});
```

(The full integration test for the upgrade command is in Task 11.)

**Step 7.2 — Replace string-compare with `compareSemver`**

In `apps/cli/src/commands/upgrade.ts` lines 80-89, replace:

```ts
if (
  target !== EDGE &&
  /^v\d/.test(current) &&
  /^v\d/.test(target) &&
  target < current &&
  !args.force
) {
```

with:

```ts
import { compareSemver } from '../lib/version-meta.js';
// ...
const isVersionTag = (s: string) => /^v?\d/.test(s);
if (
  isVersionTag(current) &&
  isVersionTag(target) &&
  compareSemver(target, current) < 0 &&
  !args.force
) {
```

(The `target !== EDGE` guard is removed in Task 9 when `EDGE` is dropped; for now keep behaviour identical by checking version-tag pattern instead.)

**Step 7.3 — Run tests (expect pass)**

```bash
pnpm --filter @zeno/cli test -- upgrade-semver
```

**Step 7.4 — Commit**

```bash
git add apps/cli/src/commands/upgrade.ts apps/cli/tests/commands/upgrade-semver.test.ts
git commit -m "fix(cli): use compareSemver for upgrade downgrade guard"
```

---

### Task 8: A4 — install.sh stops cloning main by default

(install.sh full rewrite happens in Task 11; this task ensures the bug is no longer present once Task 11 lands. Skip ahead — A4 is jointly tested by B5 in Task 11 step 11.6.)

> No standalone task — A4 is closed by Task 11 (install.sh rewrite). Reference: spec § AC A4.

---

### Task 9: A3 prep — drop `EDGE_TAG`/`EDGE` from `lib/upgrade.ts`

**Files:**
- Modify: `apps/cli/src/lib/upgrade.ts`
- Modify: `apps/cli/src/commands/upgrade.ts`

**Step 9.1 — Modify `lib/upgrade.ts`**

In `apps/cli/src/lib/upgrade.ts`:

1. Remove the constant `const EDGE_TAG = 'edge'` (line 15).
2. Remove the export `export const EDGE = EDGE_TAG` (line 125).
3. Rename `checkoutTag(tag: string): void` to `checkoutRef(target: string, kind: VersionKind): void`. Inside the body, branch on `kind`:

```ts
import type { VersionKind } from './version-meta.js';
// ...
checkoutRef(target: string, kind: VersionKind): void {
  if (kind === 'unstable') {
    run('git', ['checkout', 'main']);
    run('git', ['pull', '--ff-only']);
  } else if (kind === 'branch') {
    run('git', ['fetch', '--depth', '1', 'origin', target]);
    run('git', ['checkout', target]);
  } else if (kind === 'pr') {
    run('gh', ['pr', 'checkout', target]);
  } else {
    // tag
    run('git', ['checkout', target]);
  }
},
```

4. Update `pickTarget` signature to return `{ kind: VersionKind; value: string } | { error: string }` instead of just `string | { error: string }`:

```ts
export function pickTarget(
  args: PickArgs,
  releases: Release[],
): { kind: VersionKind; value: string } | { error: string } {
  if (args.unstable) return { kind: 'unstable', value: '' };
  if (args.branch) return { kind: 'branch', value: args.branch };
  if (args.pr) return { kind: 'pr', value: args.pr };
  if (args.to) {
    const found = releases.find((r) => r.tag === args.to);
    if (!found) return { error: `version ${args.to} not found. see: zeno upgrade --list` };
    return { kind: 'tag', value: found.tag };
  }
  const filtered = args.prerelease ? releases : releases.filter((r) => !r.prerelease);
  const tag = filtered[0]?.tag ?? releases[0]?.tag;
  return tag ? { kind: 'tag', value: tag } : { kind: 'unstable', value: '' };
}
```

5. Update `PickArgs` interface to include `unstable`, `branch`, `pr` fields and remove `edge`.
6. Update `listReleases(limit?: number)` to accept an optional `limit` (default 30) and pass it to `gh release list --limit "${limit}"` and the REST URL `?per_page=${limit}`.

**Step 9.2 — Update callers in `commands/upgrade.ts` to consume the new shape**

Adapt the existing upgrade flow temporarily so the project still compiles. Full rewrite happens in Tasks 12-15. For now, narrow `pickTarget`'s return into the legacy `target: string` to limit blast radius:

```ts
const picked = pickTarget(/* args mapped */ ..., releases);
if ('error' in picked) { ... }
const target = picked.value || (picked.kind === 'unstable' ? 'unstable' : '');
```

**Step 9.3 — Typecheck**

```bash
pnpm --filter @zeno/cli typecheck
```

Expected: pass (some legacy paths shimmed; cleanup in Phase 4).

**Step 9.4 — Commit**

```bash
git add apps/cli/src/lib/upgrade.ts apps/cli/src/commands/upgrade.ts
git commit -m "refactor(cli): drop EDGE_TAG, introduce VersionKind discriminator"
```

---

### Phase 2 quality gate

```bash
pnpm run quality-gate
```

Expected: green. If red, debug and fix before Phase 3.

---

## Phase 3 — `install.sh` overhaul (B + A4)

### Task 10: rewrite `install.sh` flag parser + REST resolver

**Files:**
- Modify: `infra/install.sh`
- Create: `apps/cli/tests/commands/install-sh.test.ts` (smoke for parser + .installed-from format)

**Step 10.1 — Add a parser smoke test (uses `sh` directly)**

```ts
// apps/cli/tests/commands/install-sh.test.ts
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SH = resolve(__dirname, '../../../../infra/install.sh');

describe('install.sh parser (smoke)', () => {
  it('rejects two target flags together', () => {
    const r = spawnSync('sh', [SH, '--unstable', '--branch', 'foo', '--dry-parse'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/mutually exclusive/);
  });

  it('--unstable resolves to kind=unstable in --dry-parse', () => {
    const r = spawnSync('sh', [SH, '--unstable', '--dry-parse'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('KIND=unstable');
  });

  it('--version <tag> resolves to kind=tag', () => {
    const r = spawnSync('sh', [SH, '--version', 'v2026.5.7', '--dry-parse'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('KIND=tag');
    expect(r.stdout).toContain('VALUE=v2026.5.7');
  });

  it('--branch <name> resolves to kind=branch', () => {
    const r = spawnSync('sh', [SH, '--branch', 'feat/foo', '--dry-parse'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('KIND=branch');
  });

  it('--pr <number> resolves to kind=pr', () => {
    const r = spawnSync('sh', [SH, '--pr', '123', '--dry-parse'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('KIND=pr');
  });

  it('rejects --beta', () => {
    const r = spawnSync('sh', [SH, '--beta', '--dry-parse'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unknown flag/);
  });
});
```

**Step 10.2 — Rewrite `infra/install.sh`**

Replace the entire file content with:

```sh
#!/bin/sh
# zeno-agent installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ribeirogab/zeno-agent/main/install.sh | sh
#   curl -fsSL ... | sh -s -- --unstable
#   curl -fsSL ... | sh -s -- --version v2026.5.7
#   curl -fsSL ... | sh -s -- --branch feat/foo
#   curl -fsSL ... | sh -s -- --pr 123
#
# Flags (mutex): --unstable | --version <tag> | --branch <name> | --pr <number>
# Default (no flag): latest stable release → fallback prerelease → fallback main.

set -eu

ZENO_DATA="${HOME}/.zeno"
ZENO_HOME="${ZENO_DATA}/zeno-agent"
BIN_DIR="${HOME}/.local/bin"
REPO="ribeirogab/zeno-agent"
REPO_URL="https://github.com/${REPO}.git"
API_BASE="${ZENO_INSTALL_API_BASE:-https://api.github.com}"

KIND=""
VALUE=""
DRY_PARSE=0

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

fail_mutex() {
  fail "--unstable, --version, --branch, --pr are mutually exclusive"
}

print_usage() {
  cat <<'USAGE'
zeno-agent installer

Usage:
  install.sh                      install latest stable release (fallback prerelease, fallback main)
  install.sh --unstable           install main HEAD (no CI gate; may break)
  install.sh --version <tag>      install a specific release tag
  install.sh --branch <name>      install a specific branch
  install.sh --pr <number>        install a specific pull request branch
  install.sh --help               show this help
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --unstable)  [ -n "$KIND" ] && fail_mutex; KIND="unstable" ;;
    --version)   [ -n "$KIND" ] && fail_mutex; KIND="tag";    shift; [ $# -gt 0 ] || fail "--version requires a value"; VALUE="$1" ;;
    --branch)    [ -n "$KIND" ] && fail_mutex; KIND="branch"; shift; [ $# -gt 0 ] || fail "--branch requires a value";  VALUE="$1" ;;
    --pr)        [ -n "$KIND" ] && fail_mutex; KIND="pr";     shift; [ $# -gt 0 ] || fail "--pr requires a value";      VALUE="$1" ;;
    --dry-parse) DRY_PARSE=1 ;;
    -h|--help)   print_usage; exit 0 ;;
    *)           fail "unknown flag: $1" ;;
  esac
  shift
done

parse_tag() {
  grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/'
}

resolve_default() {
  TAG=$(curl -fsSL "${API_BASE}/repos/${REPO}/releases/latest" 2>/dev/null | parse_tag || true)
  if [ -n "${TAG:-}" ]; then
    KIND="tag"; VALUE="$TAG"; return
  fi
  TAG=$(curl -fsSL "${API_BASE}/repos/${REPO}/releases?per_page=1" 2>/dev/null | parse_tag || true)
  if [ -n "${TAG:-}" ]; then
    KIND="tag"; VALUE="$TAG"; return
  fi
  KIND="unstable"; VALUE=""
}

if [ -z "$KIND" ]; then
  resolve_default
fi

if [ "$DRY_PARSE" -eq 1 ]; then
  printf 'KIND=%s\n' "$KIND"
  printf 'VALUE=%s\n' "$VALUE"
  exit 0
fi

# Validate --version tag exists before clone
if [ "$KIND" = "tag" ]; then
  STATUS=$(curl -fsSL -o /dev/null -w '%{http_code}' "${API_BASE}/repos/${REPO}/releases/tags/${VALUE}" || true)
  if [ "$STATUS" != "200" ]; then
    fail "version ${VALUE} not found"
  fi
fi

if [ -e "$ZENO_HOME" ]; then
  printf 'error: %s already exists.\n' "$ZENO_HOME" >&2
  printf '       to update, run: zeno upgrade\n' >&2
  printf '       to reinstall, remove the directory first: rm -rf %s\n' "$ZENO_HOME" >&2
  exit 1
fi

if [ -e "$HOME/zeno-agent" ]; then
  printf '\nnote: legacy install detected at %s\n' "$HOME/zeno-agent" >&2
  printf '      this is the pre-multi-profile-cli location and is no longer used.\n' >&2
  printf '      back up any work in ~/zeno-agent/profiles/* (zeno.db lives in docker volumes,\n' >&2
  printf '      not in the repo), then remove the legacy install:\n' >&2
  printf '        rm -rf %s\n\n' "$HOME/zeno-agent" >&2
fi

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "$1 not found. $2"
  fi
}

need git    'install git: https://git-scm.com/downloads'
need docker 'install Docker Desktop (mac/win) or Engine (linux): https://docs.docker.com/get-docker/'
need node   'install Node.js 24 LTS: https://nodejs.org/ (recommend fnm/nvm)'
need pnpm   'install pnpm 10: https://pnpm.io/installation'
need curl   'install curl: https://curl.se/'

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 24 ]; then
  fail "node 24+ required, got $(node -v)"
fi

mkdir -p "$ZENO_DATA"

case "$KIND" in
  unstable)
    printf 'cloning %s (main) into %s\n' "$REPO_URL" "$ZENO_HOME"
    git clone --depth 1 --branch main "$REPO_URL" "$ZENO_HOME"
    ;;
  tag|branch)
    printf 'cloning %s (%s %s) into %s\n' "$REPO_URL" "$KIND" "$VALUE" "$ZENO_HOME"
    git clone --depth 1 --branch "$VALUE" "$REPO_URL" "$ZENO_HOME"
    ;;
  pr)
    printf 'cloning %s (pr/%s) into %s\n' "$REPO_URL" "$VALUE" "$ZENO_HOME"
    git clone --depth 1 "$REPO_URL" "$ZENO_HOME"
    ( cd "$ZENO_HOME" && git fetch --depth 1 origin "pull/${VALUE}/head:pr-${VALUE}" && git checkout "pr-${VALUE}" )
    ;;
esac

SHA=$(git -C "$ZENO_HOME" rev-parse --short HEAD)
META="${ZENO_HOME}/.installed-from"
case "$KIND" in
  tag)      printf 'tag:%s@%s\n' "$VALUE" "$SHA" > "$META" ;;
  unstable) printf 'unstable:@%s\n' "$SHA"       > "$META" ;;
  branch)   printf 'branch:%s@%s\n' "$VALUE" "$SHA" > "$META" ;;
  pr)       printf 'pr:%s@%s\n' "$VALUE" "$SHA"     > "$META" ;;
esac

cd "$ZENO_HOME"
pnpm install --frozen-lockfile
pnpm build --filter @zeno/cli

mkdir -p "$BIN_DIR"
ln -sf "$ZENO_HOME/apps/cli/dist/index.js" "$BIN_DIR/zeno"
chmod +x "$ZENO_HOME/apps/cli/dist/index.js"

printf '\n* Cloned to %s\n' "$ZENO_HOME"
printf '* Installed CLI to %s/zeno\n' "$BIN_DIR"
printf '* Installed from: %s\n' "$(cat "$META")"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    printf '\n  %s not in PATH.\n' "$BIN_DIR"
    case "${SHELL##*/}" in
      zsh)  RC="$HOME/.zshrc" ;;
      bash) RC="$HOME/.bashrc" ;;
      *)    RC="your shell rc" ;;
    esac
    printf '  add to %s:\n' "$RC"
    # shellcheck disable=SC2016
    printf '    export PATH="$HOME/.local/bin:$PATH"\n'
    ;;
esac

printf '\nNext:  zeno profile create <profile>\n'
printf '       zeno start <profile>\n\n'
printf 'Docs:  https://github.com/ribeirogab/zeno-agent#readme\n'
```

**Step 10.3 — Run smoke test (parser only, no clone)**

```bash
pnpm --filter @zeno/cli test -- install-sh
```

Expected: all parser smoke tests pass.

**Step 10.4 — Commit**

```bash
git add infra/install.sh apps/cli/tests/commands/install-sh.test.ts
git commit -m "feat(install.sh): rewrite with --unstable/--version/--branch/--pr flags + default fallback chain"
```

---

### Task 11: install.sh end-to-end smoke (mocked REST)

**Files:**
- Extend: `apps/cli/tests/commands/install-sh.test.ts`

**Step 11.1 — Add a fallback-chain test (mocking `${API_BASE}` via a local HTTP server)**

```ts
// extend the existing apps/cli/tests/commands/install-sh.test.ts
import { createServer } from 'node:http';

describe('install.sh fallback chain', () => {
  function startMock(handler: (path: string) => { status: number; body: string }) {
    const server = createServer((req, res) => {
      const r = handler(req.url ?? '');
      res.statusCode = r.status;
      res.end(r.body);
    });
    return new Promise<{ url: string; close: () => void }>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as { port: number };
        resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
      });
    });
  }

  it('falls back to prerelease when /releases/latest is 404', async () => {
    const mock = await startMock((path) => {
      if (path.includes('/releases/latest')) return { status: 404, body: '{}' };
      if (path.includes('/releases?per_page=1')) {
        return { status: 200, body: '[{"tag_name":"v2026.5.0-beta"}]' };
      }
      return { status: 404, body: '{}' };
    });
    const r = spawnSync('sh', [SH, '--dry-parse'], {
      encoding: 'utf8',
      env: { ...process.env, ZENO_INSTALL_API_BASE: mock.url },
    });
    mock.close();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('KIND=tag');
    expect(r.stdout).toContain('VALUE=v2026.5.0-beta');
  });

  it('falls back to main when both REST endpoints are 404', async () => {
    const mock = await startMock(() => ({ status: 404, body: '{}' }));
    const r = spawnSync('sh', [SH, '--dry-parse'], {
      encoding: 'utf8',
      env: { ...process.env, ZENO_INSTALL_API_BASE: mock.url },
    });
    mock.close();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('KIND=unstable');
  });
});
```

**Step 11.2 — Run + commit**

```bash
pnpm --filter @zeno/cli test -- install-sh
git add apps/cli/tests/commands/install-sh.test.ts
git commit -m "test(install.sh): cover REST fallback chain (latest → prerelease → main)"
```

---

### Phase 3 quality gate

```bash
pnpm run quality-gate
```

---

## Phase 4 — `zeno upgrade` overhaul (C + A3)

### Task 12: refactor `commands/upgrade.ts` — flags + mutex

**Files:**
- Modify: `apps/cli/src/commands/upgrade.ts`
- Modify: `apps/cli/src/lib/upgrade.ts` (`listReleases(limit)`)

**Step 12.1 — Add tests**

```ts
// apps/cli/tests/commands/upgrade-flags.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/upgrade.js', () => ({
  listReleases: vi.fn(async () => []),
  pickTarget: vi.fn(),
  upgradeSteps: { fetchTags: vi.fn(), checkoutRef: vi.fn(), setVersion: vi.fn(), writeMeta: vi.fn(), installDeps: vi.fn(), buildCli: vi.fn(), buildImage: vi.fn() },
}));

import { defineCommand } from 'citty';
import upgrade from '../../src/commands/upgrade.js';

describe('zeno upgrade flag mutex', () => {
  it('rejects --unstable + --branch', async () => {
    // run the command via citty's `runCommand` test entrypoint
    const result = await runCmd(upgrade, ['--unstable', '--branch', 'foo']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/mutually exclusive/);
  });
});

// helper — write a small wrapper that invokes citty's command, captures exit + stderr
```

**Step 12.2 — Update flag definitions in `commands/upgrade.ts`**

```ts
args: {
  to:         { type: 'string',  description: 'specific version tag (e.g. v2026.5.7)' },
  unstable:   { type: 'boolean', description: 'main HEAD (no CI gate · may break)' },
  branch:     { type: 'string',  description: 'arbitrary branch (testing)' },
  pr:         { type: 'string',  description: 'pull request number (testing)' },
  prerelease: { type: 'boolean', description: 'include pre-releases when picking latest' },
  latest:     { type: 'boolean', description: 'jump to latest stable, skip picker' },
  list:       { type: 'boolean', description: 'list available versions and exit' },
  notes:      { type: 'string',  description: 'print release notes for <tag> and exit' },
  force:      { type: 'boolean', description: 'allow downgrade (semver compare)' },
  dryRun:     { type: 'boolean', description: 'resolve target + print pipeline steps; no execution' },
  yes:        { type: 'boolean', description: 'skip confirmation prompts for unstable/branch/pr' },
  limit:      { type: 'string',  description: 'pagination limit for --list (default 30)' },
},
```

**Step 12.3 — Mutex check**

Right after parsing args:

```ts
const targetFlags = [
  args.to ? '--to' : null,
  args.unstable ? '--unstable' : null,
  args.branch ? '--branch' : null,
  args.pr ? '--pr' : null,
  args.latest ? '--latest' : null,
  args.prerelease ? '--prerelease' : null,
].filter(Boolean) as string[];

if (targetFlags.length > 1) {
  console.error(err(`${targetFlags.join(' and ')} are mutually exclusive`));
  process.exit(1);
}
```

**Step 12.4 — Notes early-exit**

```ts
if (args.notes) {
  const r = spawnSync('gh', ['release', 'view', args.notes], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
}
```

**Step 12.5 — Run tests + commit**

```bash
pnpm --filter @zeno/cli test -- upgrade-flags
git add apps/cli/src/commands/upgrade.ts apps/cli/src/lib/upgrade.ts apps/cli/tests/commands/upgrade-flags.test.ts
git commit -m "feat(cli): add upgrade flags --unstable/--branch/--pr/--dry-run/--yes/--limit/--notes + mutex"
```

---

### Task 13: confirmation prompts for unstable/branch/pr (C6)

**Files:**
- Modify: `apps/cli/src/commands/upgrade.ts`

**Step 13.1 — Test the prompt + bypass**

```ts
// add to apps/cli/tests/commands/upgrade-flags.test.ts
it('--unstable in non-TTY without --yes exits 1', async () => {
  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  const r = await runCmd(upgrade, ['--unstable']);
  expect(r.exitCode).toBe(1);
  expect(r.stderr).toMatch(/--unstable requires --yes/);
});
```

**Step 13.2 — Implement the gate**

After mutex + before pipeline:

```ts
import { confirm } from '../lib/prompt.js';

if ((args.unstable || args.branch || args.pr) && !args.yes) {
  const kind = args.unstable ? 'unstable' : args.branch ? 'branch' : 'pr';
  if (!process.stdin.isTTY) {
    console.error(err(`--${kind} requires --yes in non-interactive mode`));
    process.exit(1);
  }
  const ok = await confirm(`${kind} target may break. continue? (y/N)`);
  if (!ok) { console.log(c.gray('aborted.')); return; }
}
```

**Step 13.3 — Run + commit**

```bash
pnpm --filter @zeno/cli test -- upgrade-flags
git add apps/cli/src/commands/upgrade.ts apps/cli/tests/commands/upgrade-flags.test.ts
git commit -m "feat(cli): confirmation prompt for unstable/branch/pr targets (C6)"
```

---

### Task 14: pipeline reorder + auto-revert (Q5, A3, C7)

**Files:**
- Modify: `apps/cli/src/lib/upgrade.ts` (add `setVersion`/`writeMeta` to `upgradeSteps`)
- Modify: `apps/cli/src/commands/upgrade.ts` (rewrite pipeline runner + auto-revert)
- Create: `apps/cli/tests/commands/upgrade-pipeline.test.ts`

**Step 14.1 — Add the new step members in `lib/upgrade.ts`**

```ts
import { writeMeta as writeMetaImpl, type VersionMeta } from './version-meta.js';
import { queries } from '@zeno/db/host';
import type { DB } from '@zeno/db/host';
// ...
export const upgradeSteps = {
  fetchTags(): void {
    run('git', ['fetch', '--tags']);
  },
  checkoutRef(target: string, kind: VersionKind): void {
    // (body from Task 9)
  },
  setVersion(conn: DB, display: string): void {
    queries.setVersion(conn, display);
  },
  writeMeta(meta: VersionMeta): void {
    writeMetaImpl(meta);
  },
  installDeps(): void {
    run('pnpm', ['install', '--frozen-lockfile']);
  },
  buildCli(): void {
    run('pnpm', ['build', '--filter', '@zeno/cli']);
  },
  buildImage(): void {
    run('docker', ['build', '-t', 'zeno-agent:dev', '-f', 'infra/Dockerfile', '.']);
  },
};
```

**Step 14.2 — Pipeline test (auto-revert)**

```ts
// apps/cli/tests/commands/upgrade-pipeline.test.ts
import { describe, expect, it, vi } from 'vitest';

const mocks = {
  fetchTags: vi.fn(), checkoutRef: vi.fn(), setVersion: vi.fn(),
  writeMeta: vi.fn(), installDeps: vi.fn(),
  buildCli: vi.fn(), buildImage: vi.fn(() => { throw new Error('docker fail'); }),
};
vi.mock('../../src/lib/upgrade.js', () => ({
  upgradeSteps: mocks,
  listReleases: vi.fn(async () => [{ tag: 'v2026.5.7', prerelease: false, publishedAt: '2026-05-07' }]),
  pickTarget: vi.fn(),
}));
vi.mock('../../src/lib/version-meta.js', async () => {
  const actual = await vi.importActual('../../src/lib/version-meta.js');
  return { ...actual, readMeta: vi.fn(() => ({ kind: 'tag', value: 'v2026.5.6', sha: 'aaa' })) };
});

import upgrade from '../../src/commands/upgrade.js';

describe('zeno upgrade pipeline', () => {
  it('auto-reverts to previous .installed-from when buildImage fails', async () => {
    const r = await runCmd(upgrade, ['--to', 'v2026.5.7', '--yes']);
    expect(r.exitCode).toBe(1);
    expect(mocks.checkoutRef).toHaveBeenCalledTimes(2);
    expect(mocks.checkoutRef.mock.calls[1][0]).toBe('v2026.5.6'); // revert to prev
    expect(r.stderr).toMatch(/buildImage failed/);
    expect(r.stderr).toMatch(/reverted to v2026.5.6/);
  });

  it('--dry-run prints all 7 steps without executing', async () => {
    const r = await runCmd(upgrade, ['--branch', 'foo', '--yes', '--dry-run']);
    expect(r.exitCode).toBe(0);
    expect(mocks.fetchTags).not.toHaveBeenCalled();
    expect(mocks.buildImage).not.toHaveBeenCalled();
    for (const step of ['fetchTags', 'checkoutRef', 'setVersion', 'writeMeta', 'installDeps', 'buildCli', 'buildImage']) {
      expect(r.stdout).toContain(step);
    }
  });
});
```

**Step 14.3 — Replace pipeline body in `commands/upgrade.ts`**

```ts
import { formatDisplay, readMeta, type VersionMeta } from '../lib/version-meta.js';
// ...

// after target resolved:
const meta: VersionMeta = { kind: picked.kind, value: picked.value, sha: '' /* set after checkout */ };

if (args.dryRun) {
  console.log(`target: ${meta.kind}:${meta.value}`);
  console.log('steps:');
  console.log('  1. fetchTags');
  console.log(`  2. checkoutRef(${meta.value || 'main'}, ${meta.kind})`);
  console.log('  3. setVersion');
  console.log('  4. writeMeta');
  console.log('  5. installDeps');
  console.log('  6. buildCli');
  console.log('  7. buildImage');
  return;
}

const prev = readMeta();
try {
  await spin('fetching tags', async () => upgradeSteps.fetchTags());
  await spin(`checkout ${meta.kind}:${meta.value || 'main'}`, async () =>
    upgradeSteps.checkoutRef(meta.value || 'main', meta.kind),
  );
  meta.sha = shortSha();
  upgradeSteps.setVersion(conn, formatDisplay(meta));
  upgradeSteps.writeMeta(meta);
  await spin('installing dependencies', async () => upgradeSteps.installDeps());
  await spin('building CLI', async () => upgradeSteps.buildCli());
  await spin('building zeno-agent:dev', async () => upgradeSteps.buildImage());
} catch (e) {
  console.error(err(`upgrade failed: ${(e as Error).message}`));
  if (prev) {
    try {
      console.log(info('reverting...'));
      upgradeSteps.checkoutRef(prev.value || 'main', prev.kind);
      upgradeSteps.setVersion(conn, formatDisplay(prev));
      upgradeSteps.writeMeta(prev);
      console.log(ok(`reverted to ${formatDisplay(prev)}`));
    } catch (revertErr) {
      console.error(err(`revert failed: ${(revertErr as Error).message}`));
      console.error(c.gray(`  → restore manually: zeno upgrade --to ${prev.kind === 'tag' ? prev.value : '<prev>'}`));
    }
  }
  process.exit(1);
}

// shortSha helper:
function shortSha(): string {
  const r = spawnSync('git', ['-C', ZENO_HOME, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  return r.stdout.trim() || 'unknown';
}
```

**Step 14.4 — Run + commit**

```bash
pnpm --filter @zeno/cli test -- upgrade-pipeline
git add apps/cli/src/lib/upgrade.ts apps/cli/src/commands/upgrade.ts apps/cli/tests/commands/upgrade-pipeline.test.ts
git commit -m "feat(cli): pipeline reorder + auto-revert + --dry-run for zeno upgrade (A3, C7)"
```

---

### Task 15: pagination + picker polish (C8, C9, C10)

**Files:**
- Modify: `apps/cli/src/lib/upgrade.ts` (`listReleases(limit?)`)
- Modify: `apps/cli/src/commands/upgrade.ts` (`pickInteractive` + `printReleaseTable`)

**Step 15.1 — Update `listReleases` signature**

```ts
export async function listReleases(limit = 30): Promise<Release[]> {
  if (ghAvailable()) return listReleasesViaGh(limit);
  try { return await listReleasesViaRest(limit); }
  catch (e) { throw new Error(`cannot fetch releases: ${(e as Error).message}`); }
}

async function listReleasesViaGh(limit: number): Promise<Release[]> {
  const r = spawnSync('gh', ['release', 'list', '--repo', REPO, '--limit', String(limit), '--json', 'tagName,isPrerelease,publishedAt,name'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`gh release list failed: ${r.stderr}`);
  // ... existing parse
}

async function listReleasesViaRest(limit: number): Promise<Release[]> {
  const url = `${API_BASE}/repos/${REPO}/releases?per_page=${limit}`;
  // ... existing parse
}
```

**Step 15.2 — Wire `--limit` in `commands/upgrade.ts`**

```ts
const limit = args.limit ? parseInt(args.limit as string, 10) : 30;
const releases = await listReleases(limit);
```

**Step 15.3 — Picker initialIndex on latest stable + visual highlight**

In `pickInteractive`:

```ts
const initial = releases.findIndex((r) => !r.prerelease); // latest stable
const items = [
  ...releases.map((r) => ({
    label:
      (r.tag === current ? `${c.gold(r.tag)}  ` : `${r.tag}  `) +
      (r.prerelease ? c.yellow('pre-release') : c.green('stable')),
    hint: r.tag === current ? 'current *' : r.publishedAt.slice(0, 10),
  })),
  { label: c.gray('─'.repeat(40)), hint: '', disabled: true },
  { label: c.yellow('unstable'), hint: 'main HEAD · may break' },
];
const idx = await pick(items, {
  title: `${c.bold('select target')}  ${c.gray('↑/↓ + Enter · q to abort · n: notes')}`,
  initialIndex: initial >= 0 ? initial : 0,
});
if (idx === null) return null;
if (idx === items.length - 1) return { kind: 'unstable', value: '' };
if (items[idx]?.disabled) return null; // separator
return { kind: 'tag', value: releases[idx].tag };
```

(Picker library may need a `disabled` field — if not present, add it as part of D10's coverage.)

**Step 15.4 — Run + commit**

```bash
pnpm --filter @zeno/cli test -- upgrade
git add apps/cli/src/lib/upgrade.ts apps/cli/src/commands/upgrade.ts
git commit -m "feat(cli): paginate upgrade --list + picker initialIndex on latest stable + unstable highlight (C8/C9/C10)"
```

---

### Task 16: `zeno --version` reads `.installed-from` (C4)

**Files:**
- Modify: `apps/cli/src/lib/version.ts`

**Step 16.1 — Read meta + concat with package version**

```ts
// apps/cli/src/lib/version.ts
import { formatDisplay, readMeta } from './version-meta.js';

export function readVersionFromPackage(): string {
  // ... existing logic that reads package.json version
  const pkgVersion = /* existing */;
  const meta = readMeta();
  if (!meta) return pkgVersion;
  if (meta.kind === 'tag') return formatDisplay(meta);
  return `${pkgVersion} (${formatDisplay(meta)})`;
}
```

**Step 16.2 — Manual smoke**

```bash
pnpm --filter @zeno/cli build
node apps/cli/dist/index.js --version
```

Expected: prints version + meta when `.installed-from` exists.

**Step 16.3 — Commit**

```bash
git add apps/cli/src/lib/version.ts
git commit -m "feat(cli): zeno --version reads .installed-from for kind/sha display"
```

---

### Task 17: `--notes` flag wiring (C11)

Already covered in Task 12 (`if (args.notes) ...`). Verify the picker key hint `n: notes` is present (Task 15). No new commit — this task closes via the C11 acceptance criterion.

---

### Task 18: `--help` listing + final upgrade typecheck (C12)

**Files:**
- Inspect: `apps/cli/src/commands/upgrade.ts`

**Step 18.1 — Verify all 12 flags appear in `args` definitions**

Run:

```bash
node apps/cli/dist/index.js upgrade --help
```

Expected: every flag in C12's list appears: `--to`, `--latest`, `--prerelease`, `--unstable`, `--branch`, `--pr`, `--list`, `--force`, `--dry-run`, `--yes`, `--limit`, `--notes`.

If any are missing, add `description` strings in the `args` block (citty auto-generates `--help` from these).

**Step 18.2 — Phase 4 quality gate**

```bash
pnpm run quality-gate
```

If green, commit any final tweaks:

```bash
git add apps/cli/src/commands/upgrade.ts
git commit -m "chore(cli): finalize zeno upgrade --help (C12)"
```

---

## Phase 5 — Picker fallback (D)

### Task 19: refactor template — `commands/connector-list.ts` (D1, D4)

**Files:**
- Modify: `apps/cli/src/commands/connector-list.ts`
- Modify: `apps/cli/tests/commands/connector-list.test.ts`

**Step 19.1 — Test: `args.profile ?? 'default'` is gone, `resolveProfile` is called**

```ts
// extend apps/cli/tests/commands/connector-list.test.ts
import { resolveProfile } from '../../src/lib/resolvers.js';
vi.mock('../../src/lib/resolvers.js', () => ({
  resolveProfile: vi.fn(async () => ({ name: 'fn', port: 6101 })),
}));

it('uses resolveProfile, not literal default', async () => {
  await runCmd(list, []);
  expect(resolveProfile).toHaveBeenCalled();
});
```

**Step 19.2 — Replace the literal**

In `apps/cli/src/commands/connector-list.ts`:

```ts
import { resolveProfile } from '../lib/resolvers.js';
import { resolveProfileApiUrl } from '../lib/api-base.js';
// ...
async run({ args }) {
  const profile = await resolveProfile(args.profile);
  const baseUrl = await resolveProfileApiUrl(profile.name);
  // ... rest unchanged
}
```

**Step 19.3 — Run + commit**

```bash
pnpm --filter @zeno/cli test -- connector-list
git add apps/cli/src/commands/connector-list.ts apps/cli/tests/commands/connector-list.test.ts
git commit -m "refactor(cli): connector list uses resolveProfile (D1)"
```

---

### Task 20: refactor — remaining connector commands (D1)

**Files:**
- Modify: each of:
  - `connector-show.ts`, `connector-test.ts`, `connector-enable.ts`, `connector-disable.ts`
  - `connector-uninstall.ts`, `connector-refresh-tools.ts`, `connector-catalog.ts`
  - `connector-secret-list.ts`, `connector-secret-set.ts`, `connector-secret-rotate.ts`, `connector-secret-reveal.ts`
  - `connector-tool-list.ts`, `connector-tool-set.ts`, `connector-tool-bulk.ts`
  - `connector-app-install.ts`, `connector-app-uninstall.ts`
  - `connector-app-installations-add.ts`, `connector-app-installations-discover.ts`
  - `connector-install.ts`

**Step 20.1 — Apply the template per file**

For each file, replace:

```ts
const profile =
  typeof args.profile === 'string' && args.profile.length > 0 ? args.profile : 'default';
```

with:

```ts
import { resolveProfile } from '../lib/resolvers.js';
// ...
const { name: profile } = await resolveProfile(args.profile);
```

(Slug, catalog id, secret key, tool, permission resolution comes in Task 22.)

**Step 20.2 — Run all connector tests**

```bash
pnpm --filter @zeno/cli test -- connector
```

Fix any test that asserted the literal `'default'`. Update mocks to `resolveProfile`.

**Step 20.3 — Verify the `args.profile ?? 'default'` literal is gone**

```bash
grep -rn "args.profile ?? 'default'" apps/cli/src/commands/
grep -rn "args.profile.length > 0 ? args.profile : 'default'" apps/cli/src/commands/
```

Expected: no matches.

**Step 20.4 — Commit**

```bash
git add apps/cli/src/commands/connector-*.ts apps/cli/tests/commands/connector-*.test.ts
git commit -m "refactor(cli): connector commands resolve profile via resolveProfile (D1)"
```

---

### Task 21: lifecycle commands picker (D3)

**Files:**
- Modify: `start.ts`, `stop.ts`, `restart.ts`, `logs.ts`, `open.ts`

**Step 21.1 — Replace `resolveName` with `resolveProfile`**

These commands already use `resolveName` from `lib/profile.ts`. Replace each call:

```ts
// before:
import { requireProfile, resolveName } from '../lib/profile.js';
// ...
const name = resolveName(conn, args.profile as string | undefined);
const p = requireProfile(conn, name);

// after:
import { resolveProfile } from '../lib/resolvers.js';
// ...
const p = await resolveProfile(args.profile as string | undefined);
```

For `start.ts`/`stop.ts`/`restart.ts` keep the `--all` branch unchanged.

**Step 21.2 — Update tests / type annotations**

Run the existing tests:

```bash
pnpm --filter @zeno/cli test -- start stop restart logs open
```

Adjust mocks if any test mocked `resolveName`.

**Step 21.3 — Commit**

```bash
git add apps/cli/src/commands/start.ts apps/cli/src/commands/stop.ts apps/cli/src/commands/restart.ts apps/cli/src/commands/logs.ts apps/cli/src/commands/open.ts apps/cli/tests/commands/{start,stop,restart,logs,open}.test.ts
git commit -m "refactor(cli): lifecycle commands use resolveProfile picker fallback (D3)"
```

---

### Task 22: pickers for slug / catalog / secret / tool / permission (D5–D8)

**Files:**
- Modify: `connector-show.ts`, `connector-uninstall.ts`, `connector-test.ts`, `connector-enable.ts`, `connector-disable.ts`, `connector-refresh-tools.ts` (slug)
- Modify: `connector-install.ts` (catalog)
- Modify: `connector-secret-set.ts`, `connector-secret-reveal.ts` (secret key)
- Modify: `connector-tool-set.ts` (tool + permission)

**Step 22.1 — Pattern: each command receives a positional `slug`/`catalogId`/etc; if missing, call the resolver**

Example for `connector-show.ts`:

```ts
import { resolveConnector, resolveProfile } from '../lib/resolvers.js';
// ...
async run({ args }) {
  const profile = await resolveProfile(args.profile);
  const baseUrl = await resolveProfileApiUrl(profile.name);
  const client = new ApiClient({ baseUrl });
  const slug = await resolveConnector(args.slug as string | undefined, {
    listConnectors: () => client.get('/api/connectors'),
  });
  // ... existing show logic with `slug`
},
```

Apply the same pattern across each file with the appropriate resolver.

For `connector-tool-set.ts`:

```ts
const tool = await resolveTool(args.tool, { listTools: () => client.get(`/api/connectors/${slug}/tools`) });
const permission = await resolvePermission(args.permission);
```

For `connector-install.ts`:

```ts
const catalogId = await resolveCatalog(args.catalogId as string | undefined, {
  listCatalog: () => client.get('/api/connectors/catalog'),
});
```

**Step 22.2 — Update tests**

Each command test mocks the resolver (returns the slug) and asserts it was called when the positional was omitted.

**Step 22.3 — Run all connector tests**

```bash
pnpm --filter @zeno/cli test -- connector
```

**Step 22.4 — Commit**

```bash
git add apps/cli/src/commands/connector-*.ts apps/cli/tests/commands/connector-*.test.ts
git commit -m "feat(cli): connector commands open picker for slug/catalog/secret/tool/permission (D5-D8)"
```

---

### Task 23: `zeno profile use` picker (D2)

**Files:**
- Modify: `apps/cli/src/commands/profile-use.ts`

**Step 23.1 — Test**

```ts
// apps/cli/tests/commands/profile-use.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/picker.js', () => ({ pick: vi.fn(async () => 1) }));
vi.mock('@zeno/db/host', () => ({
  queries: {
    listProfiles: vi.fn(() => [{ name: 'a' }, { name: 'b' }]),
    getSticky: vi.fn(() => 'a'),
    setSticky: vi.fn(),
  },
}));
import { queries } from '@zeno/db/host';
import use from '../../src/commands/profile-use.js';

describe('zeno profile use', () => {
  it('opens picker when no positional in TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    await runCmd(use, []);
    expect(queries.setSticky).toHaveBeenCalledWith(expect.any(Object), 'b');
  });
  it('exits 1 when no positional in non-TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    const r = await runCmd(use, []);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/usage: zeno profile use/);
  });
  it('uses positional when passed', async () => {
    await runCmd(use, ['a']);
    expect(queries.setSticky).toHaveBeenCalledWith(expect.any(Object), 'a');
  });
});
```

**Step 23.2 — Implement**

```ts
import { defineCommand } from 'citty';
import { queries } from '@zeno/db/host';
import { c, err } from '../lib/output.js';
import { pick } from '../lib/picker.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: { name: 'use', description: 'set the sticky profile' },
  args: {
    name: { type: 'positional', description: 'profile name', required: false },
  },
  async run({ args }) {
    const conn = db();
    let name = args.name as string | undefined;
    if (!name) {
      if (!process.stdin.isTTY) {
        process.stderr.write(`${err('usage: zeno profile use <name>')}\n`);
        process.exit(1);
      }
      const profiles = queries.listProfiles(conn);
      if (profiles.length === 0) {
        process.stderr.write(`${err('no profiles. create one: zeno profile create <name>')}\n`);
        process.exit(1);
      }
      const sticky = queries.getSticky(conn);
      const items = profiles.map((p) => ({
        label: p.name,
        hint: sticky === p.name ? 'current *' : '',
      }));
      const idx = await pick(items, { title: `${c.bold('select sticky profile')}` });
      if (idx === null) { process.stderr.write(`${err('aborted')}\n`); process.exit(1); }
      name = profiles[idx].name;
    }
    queries.setSticky(conn, name);
    console.log(`sticky → ${c.gold(name)}`);
  },
});
```

**Step 23.3 — Run + commit**

```bash
pnpm --filter @zeno/cli test -- profile-use
git add apps/cli/src/commands/profile-use.ts apps/cli/tests/commands/profile-use.test.ts
git commit -m "feat(cli): zeno profile use opens picker when no positional (D2)"
```

---

### Phase 5 quality gate

```bash
pnpm run quality-gate
```

---

## Phase 6 — UX polish (E)

### Task 24: `zeno status` command (E1)

**Files:**
- Create: `apps/cli/src/commands/status.ts`
- Modify: `apps/cli/src/index.ts` (register subcommand)
- Create: `apps/cli/tests/commands/status.test.ts`
- Create: `apps/cli/src/types/json-output.ts` (initial)

**Step 24.1 — Test the renderer + JSON shape**

```ts
// apps/cli/tests/commands/status.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/lib/state.js', () => ({ db: () => ({}) }));
vi.mock('@zeno/db/host', () => ({
  queries: { listProfiles: () => [{ name: 'fn', port: 6101 }, { name: 'work', port: 6102 }] },
}));
vi.mock('../../src/lib/orchestrator/singleton.js', () => ({
  orchestrator: () => ({
    listManagedContainers: async () => [{ profile: 'fn', state: 'running' }, { profile: 'work', state: 'stopped' }],
  }),
}));
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

import status from '../../src/commands/status.js';

describe('zeno status', () => {
  it('renders running + stopped + connector count', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }] });
    const r = await runCmd(status, []);
    expect(r.stdout).toContain('fn');
    expect(r.stdout).toContain('3 connectors');
    expect(r.stdout).toContain('work');
    expect(r.stdout).toMatch(/stopped/);
  });

  it('renders ? when API times out', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
    const r = await runCmd(status, []);
    expect(r.stdout).toContain('?');
  });

  it('--json emits the documented shape', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    const r = await runCmd(status, ['--json']);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty('name');
    expect(parsed[0]).toHaveProperty('state');
    expect(parsed[0]).toHaveProperty('connectorCount');
  });
});
```

**Step 24.2 — Implement `commands/status.ts`**

```ts
import { defineCommand } from 'citty';
import { queries } from '@zeno/db/host';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { c, formatUptime, isQuiet, rule, setQuiet, statusDot, statusLabel } from '../lib/output.js';
import { orchestrator } from '../lib/orchestrator/singleton.js';
import { db } from '../lib/state.js';
import type { StatusJson } from '../types/json-output.js';

const TIMEOUT_MS = 1000;

async function fetchWithTimeout(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export default defineCommand({
  meta: { name: 'status', description: 'overview of all profiles + connectors + crons + errors' },
  args: {
    json: { type: 'boolean', description: 'emit JSON' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const profiles = queries.listProfiles(conn);
    const live = await orchestrator().listManagedContainers().catch(() => []);
    const liveByName = new Map(live.map((l) => [l.profile, l.state]));

    const rows: StatusJson[] = await Promise.all(
      profiles.map(async (p) => {
        const state = liveByName.get(p.name) ?? p.status;
        const baseUrl = await resolveProfileApiUrl(p.name).catch(() => null);
        if (state !== 'running' || !baseUrl) {
          return { name: p.name, port: p.port, state, uptimeMs: 0, connectorCount: null, lastCron: null, lastError: null };
        }
        const [conns, crons, errs] = await Promise.all([
          fetchWithTimeout(`${baseUrl}/api/connectors`) as Promise<unknown[] | null>,
          fetchWithTimeout(`${baseUrl}/api/crons/runs?limit=1`) as Promise<unknown[] | null>,
          fetchWithTimeout(`${baseUrl}/api/logs?level=error&limit=1`) as Promise<unknown[] | null>,
        ]);
        return {
          name: p.name,
          port: p.port,
          state,
          uptimeMs: p.lastStartedAt ? Date.now() - p.lastStartedAt : 0,
          connectorCount: conns ? conns.length : null,
          lastCron: crons?.[0] ?? null,
          lastError: errs?.[0] ?? null,
        };
      }),
    );

    if (args.json) {
      process.stdout.write(`${JSON.stringify(rows)}\n`);
      return;
    }

    if (!isQuiet()) console.log(`\n  ${c.bold('profiles')}\n  ${rule(60)}`);
    for (const r of rows) {
      const conns = r.connectorCount === null ? '?' : `${r.connectorCount} connectors`;
      const uptime = r.state === 'running' ? formatUptime(Date.now() - r.uptimeMs) : '-';
      console.log(`  ${statusDot(r.state)} ${r.name.padEnd(14)} :${r.port}  ${conns.padEnd(15)} ${statusLabel(r.state)} ${uptime}`);
    }
    if (!isQuiet()) console.log('');
  },
});
```

**Step 24.3 — Define the JSON type**

```ts
// apps/cli/src/types/json-output.ts
export interface StatusJson {
  name: string;
  port: number;
  state: 'running' | 'stopped' | 'failed';
  uptimeMs: number;
  connectorCount: number | null;
  lastCron: unknown | null;
  lastError: unknown | null;
}
```

**Step 24.4 — Register in `apps/cli/src/index.ts`**

```ts
import status from './commands/status.js';
// ...
subCommands: { profile, start, stop, restart, logs, open, doctor, upgrade, repo, connector, status },
```

**Step 24.5 — Run + commit**

```bash
pnpm --filter @zeno/cli test -- status
git add apps/cli/src/commands/status.ts apps/cli/src/index.ts apps/cli/src/types/json-output.ts apps/cli/tests/commands/status.test.ts
git commit -m "feat(cli): zeno status — fan-out HTTP overview (E1)"
```

---

### Task 25: destructive ops `--yes` standardization (E2)

**Files:**
- Modify: `apps/cli/src/commands/profile-delete.ts`
- Modify: `apps/cli/src/commands/connector-uninstall.ts`
- Modify: `apps/cli/src/commands/connector-app-uninstall.ts`
- Modify: `apps/api/src/routes/connectors.ts` (drop `confirm_app_name_mismatch`)
- Modify: `apps/api/tests/routes/connectors-app-lifecycle.test.ts`

**Step 25.1 — `profile-delete.ts`: replace type-name pattern**

```ts
import { confirmDestructive } from '../lib/prompt.js';
// ...
args: {
  name: { type: 'positional', required: true, description: 'profile to delete' },
  yes: { type: 'boolean', description: 'skip confirmation' },
},
async run({ args }) {
  const ok = await confirmDestructive(`delete profile '${args.name}'? this destroys volumes and data. (y/N)`, { yes: args.yes });
  if (!ok) { console.log(c.gray('aborted.')); return; }
  // ... existing destroy logic
}
```

Delete the existing `Type '<name>' to confirm:` block and its parsing.

**Step 25.2 — `connector-uninstall.ts`**

```ts
const ok = await confirmDestructive(`uninstall connector '${slug}'? (y/N)`, { yes: args.yes });
if (!ok) return;
// ... existing call to API
```

**Step 25.3 — `connector-app-uninstall.ts`: drop `--confirm`**

```ts
args: {
  // remove `confirm: { type: 'string', ... }`
  yes: { type: 'boolean', description: 'skip confirmation' },
},
async run({ args }) {
  // fetch the App's name first to enrich the prompt
  const app = await client.get<{ displayName: string; installationsCount: number }>(`/api/connectors/apps/${appId}`);
  const ok = await confirmDestructive(`uninstall app '${app.displayName}'? this cascades to ${app.installationsCount} installations. (y/N)`, { yes: args.yes });
  if (!ok) return;
  await client.delete(`/api/connectors/apps/${appId}`);
}
```

**Step 25.4 — API: drop `confirm_app_name_mismatch`**

In `apps/api/src/routes/connectors.ts`, find the DELETE-app route handler and remove the body validation that checks `confirm` against the app's name. Remove the `400 confirm_app_name_mismatch` response branch.

**Step 25.5 — API test: drop the confirm-name expectation**

In `apps/api/tests/routes/connectors-app-lifecycle.test.ts`, remove (or rewrite) tests that asserted the `400 confirm_app_name_mismatch` behaviour.

**Step 25.6 — Run + commit**

```bash
pnpm --filter @zeno/cli test
pnpm --filter @zeno/api test
git add apps/cli/src/commands/profile-delete.ts apps/cli/src/commands/connector-uninstall.ts apps/cli/src/commands/connector-app-uninstall.ts apps/api/src/routes/connectors.ts apps/api/tests/routes/connectors-app-lifecycle.test.ts
git commit -m "feat(cli,api): destructive ops standardize on prompt + --yes; drop --confirm app-name (E2)"
```

---

### Task 26: friendly errors wired across mutating commands (E3)

**Files:**
- Modify: each connector command's `async run({ args })` body to wrap the API mutation in `runCommand`

**Step 26.1 — Pattern**

```ts
import { runCommand } from '../lib/errors.js';
// ...
async run({ args }) {
  const profile = await resolveProfile(args.profile);
  // ...
  await runCommand(async () => {
    await client.post('/api/connectors', { ... });
    console.log(ok('installed'));
  });
}
```

Apply to: `connector-install.ts`, `connector-uninstall.ts`, `connector-enable.ts`, `connector-disable.ts`, `connector-test.ts`, `connector-refresh-tools.ts`, `connector-secret-set.ts`, `connector-secret-rotate.ts`, `connector-secret-reveal.ts`, `connector-tool-set.ts`, `connector-tool-bulk.ts`, `connector-app-install.ts`, `connector-app-uninstall.ts`, `connector-app-installations-add.ts`.

**Step 26.2 — Tests**

For each command, add a test that mocks `ApiClient.post` to throw `ApiError(409, { error: 'single_instance_catalog_already_installed', ... })` and asserts the friendly hint appears in stderr.

**Step 26.3 — Commit**

```bash
git add apps/cli/src/commands/connector-*.ts apps/cli/tests/commands/connector-*.test.ts
git commit -m "feat(cli): mutating commands wrap API calls in runCommand for friendly errors (E3)"
```

---

### Task 27: `--json` + `--quiet` across read commands (E4)

**Files:**
- Modify: `apps/cli/src/commands/profile-list.ts`, `profile-show.ts`
- Modify: `apps/cli/src/commands/connector-list.ts`, `connector-show.ts`, `connector-catalog.ts`
- Modify: `apps/cli/src/commands/connector-secret-list.ts`, `connector-tool-list.ts`
- Modify: `apps/cli/src/commands/connector-app-installations-discover.ts`
- Already modified: `apps/cli/src/commands/status.ts` (Task 24)
- Add cross-cutting `--quiet` flag to ALL commands

**Step 27.1 — Pattern per read command**

```ts
args: {
  // ... existing
  json: { type: 'boolean', description: 'emit JSON' },
  quiet: { type: 'boolean', description: 'minimal output' },
},
async run({ args }) {
  if (args.quiet) setQuiet(true);
  // ... fetch
  if (args.json) {
    process.stdout.write(`${JSON.stringify(data)}\n`);
    return;
  }
  // ... existing render
}
```

**Step 27.2 — Add `--quiet` to every command's args (write commands too)**

Each command's `args` block gains `quiet: { type: 'boolean', description: 'minimal output' }`. The handler calls `if (args.quiet) setQuiet(true);` as the first line.

**Step 27.3 — Document JSON shapes in `apps/cli/src/types/json-output.ts`**

```ts
export interface ProfileListItem {
  name: string;
  port: number;
  status: 'running' | 'stopped' | 'failed';
  uptime: number;
  sticky: boolean;
}
export interface ConnectorListItem {
  slug: string;
  catalogId: string;
  status: 'enabled' | 'disabled';
  toolCount: number;
}
export interface ConnectorShowItem {
  slug: string;
  catalogId: string;
  instanceLabel: string | null;
  status: 'enabled' | 'disabled';
  secrets: Array<{ key: string; masked: string }>;
  tools: Array<{ name: string; permission: 'always_allow' | 'ask' | 'never' }>;
}
// ... add types for catalog list, secret list, tool list, discover output
```

**Step 27.4 — Test**

For each read command, add:

```ts
it('--json --quiet outputs parseable JSON', async () => {
  // ... setup
  const r = await runCmd(cmd, ['--json', '--quiet']);
  expect(() => JSON.parse(r.stdout)).not.toThrow();
});
```

**Step 27.5 — Run + commit**

```bash
pnpm --filter @zeno/cli test
git add apps/cli/src/commands/*.ts apps/cli/src/types/json-output.ts apps/cli/tests/commands/*.test.ts
git commit -m "feat(cli): --json + --quiet globals on read commands (E4)"
```

---

### Phase 6 quality gate

```bash
pnpm run quality-gate
```

---

## Phase 7 — Docs + ROADMAP

### Task 28: `apps/docs/content/docs/cli.mdx` rewrite

**Files:**
- Modify: `apps/docs/content/docs/cli.mdx`
- Modify: `apps/docs/content/docs/install.mdx`
- Modify: `README.md`

**Step 28.1 — Update `cli.mdx`**

Replace `--edge` references with `--unstable`. Add subsections for:
- `zeno status` (with `--json` schema example)
- `zeno upgrade --branch`, `--pr`, `--dry-run`, `--limit`, `--notes`
- "Scripting & automation" section listing the non-interactive guarantees:
  - flags / args / env work without TTY
  - missing args in non-TTY → exit 1 with a clear error
  - `--json` documented per command
  - `--quiet` removes spinners + colors + headers

Document each `--json` schema using a fenced JSON code block.

**Step 28.2 — Update `install.mdx`**

Document the four `install.sh` flags + the default fallback chain. Drop any mention of `--beta`.

**Step 28.3 — Update `README.md`**

Replace `--beta` reference (line 22) with `--unstable`. Tighten the install section.

**Step 28.4 — Verify no `--beta` / `--edge` references remain**

```bash
grep -rn -- '--beta\|--edge' README.md infra/install.sh apps/docs/content/docs/
```

Expected: no matches (other than Recently shipped historical entries in ROADMAP.md, which are immutable history).

**Step 28.5 — Commit**

```bash
git add apps/docs/content/docs/cli.mdx apps/docs/content/docs/install.mdx README.md
git commit -m "docs(cli,install): document new flags + status + scripting guarantees; drop --beta/--edge"
```

---

### Task 29: ROADMAP move to "Recently shipped" + final quality gate

**Files:**
- Modify: `ROADMAP.md`

**Step 29.1 — Move the entry**

In `ROADMAP.md`, cut:

```md
- [ ] [#60](https://github.com/ribeirogab/zeno-agent/issues/60) — feat(cli): UX overhaul — pickers, install.sh/upgrade parity, security fixes
```

from `## Next (committed, soon)` and paste it (with `[x]` and PR number — set right before the merge) into `## Recently shipped`. Use `[ ]` until merge; the merge commit/PR step is the one that flips it to `[x]` with the PR number.

For now (PR not yet open), leave as `[ ]` in `Next` and only move it after PR is opened. Skip this step at task time and handle as a final commit during PR open in the PR-open routine.

**Step 29.2 — Quality gate**

```bash
pnpm run quality-gate
```

Expected: all green.

**Step 29.3 — (Open PR via `/new-pr`)**

This is outside the task list — see project rule for PR opening. After the PR is opened, the final commit on the branch flips the ROADMAP entry from `## Next` to `## Recently shipped` with `[x] [#60](...) — ... ([PR #N](...))`.

---

## Spec coverage matrix

| AC | Task |
|---|---|
| A1 (hidden secret prompt) | Task 6 |
| A2 (compareSemver) | Task 1 + Task 7 |
| A3 (atomicity + auto-revert) | Task 14 |
| A4 (install.sh default) | Task 10 |
| B1 (`--unstable`) | Task 10 |
| B2 (`--version <tag>`) | Task 10 |
| B3 (`--branch <name>`) | Task 10 |
| B4 (`--pr <number>`) | Task 10 |
| B5 (default fallback chain) | Task 10 + Task 11 |
| B6 (mutex) | Task 10 |
| B7 (`--frozen-lockfile`) | Task 10 |
| B8 (`.installed-from` format) | Task 1 + Task 10 |
| B9 (docs) | Task 28 |
| C1 (rename `--edge` → `--unstable`) | Task 9 + Task 12 |
| C2 (`--branch`) | Task 12 + Task 14 |
| C3 (`--pr` via `gh pr checkout`) | Task 9 + Task 12 |
| C4 (`zeno --version` displays origin) | Task 16 |
| C5 (mutex) | Task 12 |
| C6 (confirm prompts) | Task 13 |
| C7 (`--dry-run`) | Task 14 |
| C8 (pagination `--limit`) | Task 15 |
| C9 (initialIndex on latest stable) | Task 15 |
| C10 (unstable highlight) | Task 15 |
| C11 (release `--notes`) | Task 12 + Task 17 |
| C12 (help expansion) | Task 18 |
| D1 (single resolver across connector commands) | Task 19 + Task 20 |
| D2 (`profile use` picker) | Task 23 |
| D3 (lifecycle pickers) | Task 21 |
| D4 (post-pick hint for connector commands) | Task 5 (resolver emits) |
| D5 (`connector show` slug picker) | Task 22 |
| D6 (`connector install` catalog picker) | Task 22 |
| D7 (`secret set` key picker) | Task 22 |
| D8 (`tool set` tool/permission pickers) | Task 22 |
| D9 (flags still bypass) | Task 22 (each handler accepts positional/flag) |
| D10 (single picker lib) | Task 5 (all resolvers reuse `lib/picker.ts`) |
| E1 (`zeno status`) | Task 24 |
| E2 (destructive ops standard) | Task 25 |
| E3 (friendly errors) | Task 3 + Task 26 |
| E4 (`--json` + `--quiet`) | Task 4 + Task 24 + Task 27 |
