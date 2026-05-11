---
feature: backend-cli-only
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-05-10
---
# 0072 — Backend CLI-Only — Tasks

**For this plan:** [[plan]]

> All tasks run from the repo root unless stated. Branch is already created (`feat/backend-cli-only`). Every task ends with `git commit`. Phase boundaries are commit clusters; the PR is opened only after Phase 12.

---

## Phase 1 — `packages/backends` shared package

### Task 1: Scaffold `packages/backends` workspace package

**Files:**
- Create: `packages/backends/package.json`
- Create: `packages/backends/tsconfig.json`
- Create: `packages/backends/src/index.ts` (empty placeholder)
- Modify: `pnpm-workspace.yaml` (already includes `packages/*` — verify)

- [ ] **Step 1: Create `packages/backends/package.json`**

```json
{
  "name": "@zeno/backends",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^6.0.2",
    "vitest": "^4.1.4"
  }
}
```

(Match versions to existing `packages/db/package.json`. Run `cat packages/db/package.json` if unsure.)

- [ ] **Step 2: Create `packages/backends/tsconfig.json`**

Mirror `packages/db/tsconfig.json` (same compiler options, `outDir: dist`, `rootDir: src`). Reference `tsconfig.base.json` if one exists at repo root.

- [ ] **Step 3: Create empty `packages/backends/src/index.ts`**

```ts
// Re-exports added in subsequent tasks.
export {};
```

- [ ] **Step 4: Verify workspace picks up new package**

Run: `pnpm install`
Expected: no errors, `node_modules/@zeno/backends` symlink resolves.

- [ ] **Step 5: Commit**

```bash
git add packages/backends/
git commit -m "chore(backends): scaffold packages/backends workspace package"
```

### Task 2: Move catalog loader to `packages/backends`

**Files:**
- Create: `packages/backends/src/catalog.ts` (verbatim move from `apps/api/src/lib/backends-catalog-loader.ts`)
- Create: `packages/backends/tests/catalog.test.ts` (verbatim move from `apps/api/tests/lib/backends-catalog-loader.test.ts`)
- Modify: `packages/backends/src/index.ts` (re-export)
- Delete: `apps/api/src/lib/backends-catalog-loader.ts`
- Delete: `apps/api/tests/lib/backends-catalog-loader.test.ts`
- Modify: every importer of `backends-catalog-loader` (find via grep) → import from `@zeno/backends`
- Modify: `apps/api/package.json` (add `@zeno/backends` workspace dep)

- [ ] **Step 1: Find all importers**

```bash
grep -Rn "backends-catalog-loader" apps/ packages/ tests/
```

Note the file paths.

- [ ] **Step 2: Move source verbatim**

```bash
git mv apps/api/src/lib/backends-catalog-loader.ts packages/backends/src/catalog.ts
```

No content edits in this step.

- [ ] **Step 3: Move test verbatim**

```bash
git mv apps/api/tests/lib/backends-catalog-loader.test.ts packages/backends/tests/catalog.test.ts
```

- [ ] **Step 4: Re-export from `packages/backends/src/index.ts`**

```ts
export {
  loadBackendsCatalog,
  type BackendsCatalog,
  type BackendCatalogEntry,
} from './catalog.js';
```

(Adjust the named exports to match what `catalog.ts` actually exports — check the file head.)

- [ ] **Step 5: Add workspace dep to api**

Edit `apps/api/package.json` `dependencies`:

```json
"@zeno/backends": "workspace:*"
```

- [ ] **Step 6: Update every importer to `@zeno/backends`**

For each file from step 1 (excluding the moved files themselves):

```ts
// Before
import { loadBackendsCatalog } from '@/lib/backends-catalog-loader';
// After
import { loadBackendsCatalog } from '@zeno/backends';
```

- [ ] **Step 7: Run install + build**

```bash
pnpm install
pnpm build --filter @zeno/backends
pnpm build --filter @zeno/api
```

Expected: both packages build clean.

- [ ] **Step 8: Run catalog test**

```bash
pnpm --filter @zeno/backends test
```

Expected: PASS (the test is the same one that passed in api).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(backends): move catalog loader to packages/backends"
```

### Task 3: Move `testClaudeToken` to `packages/backends`

**Files:**
- Create: `packages/backends/src/claude-test.ts` (verbatim move from `apps/api/src/lib/claude-test.ts`)
- Create: `packages/backends/tests/claude-test.test.ts` (move existing api test if any; otherwise create one)
- Modify: `packages/backends/src/index.ts` (re-export)
- Delete: `apps/api/src/lib/claude-test.ts`
- Modify: `apps/api/src/routes/backends.ts` (import from `@zeno/backends`)

- [ ] **Step 1: Find importers**

```bash
grep -Rn "claude-test" apps/ packages/ tests/
```

- [ ] **Step 2: Move source verbatim**

```bash
git mv apps/api/src/lib/claude-test.ts packages/backends/src/claude-test.ts
```

- [ ] **Step 3: Move test if it exists**

```bash
[ -f apps/api/tests/lib/claude-test.test.ts ] && git mv apps/api/tests/lib/claude-test.test.ts packages/backends/tests/claude-test.test.ts || echo "no existing test"
```

- [ ] **Step 4: Re-export from index**

Append to `packages/backends/src/index.ts`:

```ts
export { testClaudeToken, type ClaudeTestOpts, type ClaudeTestResult } from './claude-test.js';
```

(Verify named exports match `claude-test.ts` — check the file head.)

- [ ] **Step 5: Update importers**

In `apps/api/src/routes/backends.ts`:

```ts
// Before
import { testClaudeToken } from '@/lib/claude-test';
// After
import { testClaudeToken } from '@zeno/backends';
```

- [ ] **Step 6: Build + typecheck**

```bash
pnpm build --filter @zeno/backends
pnpm --filter @zeno/api typecheck
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(backends): move testClaudeToken to packages/backends"
```

### Task 4: Phase 1 quality gate

- [ ] **Step 1: Run full quality gate**

```bash
pnpm run quality-gate
```

Expected: PASS (no regressions from the refactor).

- [ ] **Step 2: If failures, fix and re-run** before moving to Phase 2.

---

## Phase 2 — CLI helper modules

### Task 5: `apps/cli/src/lib/runtime-db.ts`

**Files:**
- Create: `apps/cli/src/lib/runtime-db.ts`
- Create: `apps/cli/tests/lib/runtime-db.test.ts`
- Modify: `apps/cli/package.json` (add `@zeno/db` dep — likely already present; verify)

- [ ] **Step 1: Write the failing test**

```ts
// apps/cli/tests/lib/runtime-db.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProfileRuntimeDb } from '../../src/lib/runtime-db.js';

describe('openProfileRuntimeDb', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'zeno-runtime-test-'));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('opens the runtime DB at <workspaceDir>/zeno.db and returns repos', async () => {
    const masterKey = Buffer.alloc(32, 1);
    const profileId = 'test-profile-id';

    const handle = openProfileRuntimeDb({ workspaceDir, profileId, masterKey });

    expect(handle.backendCredentialsRepo).toBeDefined();
    expect(handle.backendSettingsRepo).toBeDefined();
    expect(handle.close).toBeTypeOf('function');
    handle.close();
  });

  it('runs runtime migrations on open', async () => {
    const masterKey = Buffer.alloc(32, 1);
    const handle = openProfileRuntimeDb({ workspaceDir, profileId: 'p', masterKey });
    // After migrations, listStatuses() should return [] (table exists)
    expect(handle.backendCredentialsRepo.listStatuses()).toEqual([]);
    handle.close();
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — module missing)**

```bash
pnpm --filter @zeno/cli test runtime-db
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/cli/src/lib/runtime-db.ts
import {
  openRuntimeDatabase,
  runRuntimeMigrations,
  BackendCredentialsRepo,
  BackendSettingsRepo,
  type OpenRuntimeDatabase,
} from '@zeno/db/runtime';
import { join } from 'node:path';

export interface ProfileRuntimeDbOpts {
  workspaceDir: string;
  profileId: string;
  masterKey: Buffer;
}

export interface ProfileRuntimeDbHandle {
  backendCredentialsRepo: BackendCredentialsRepo;
  backendSettingsRepo: BackendSettingsRepo;
  close(): void;
}

export function openProfileRuntimeDb(opts: ProfileRuntimeDbOpts): ProfileRuntimeDbHandle {
  const dbPath = join(opts.workspaceDir, 'zeno.db');
  const opened: OpenRuntimeDatabase = openRuntimeDatabase(dbPath);
  runRuntimeMigrations(opened.db);

  const backendCredentialsRepo = new BackendCredentialsRepo(opened.db, {
    masterKey: opts.masterKey,
    profileId: opts.profileId,
  });
  const backendSettingsRepo = new BackendSettingsRepo(opened.db, opts.profileId);

  return {
    backendCredentialsRepo,
    backendSettingsRepo,
    close: () => opened.sqlite.close(),
  };
}
```

(Adjust `OpenRuntimeDatabase` shape if different — check `packages/db/src/runtime/db.ts`.)

- [ ] **Step 4: Run test (expect PASS)**

```bash
pnpm --filter @zeno/cli test runtime-db
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/lib/runtime-db.ts apps/cli/tests/lib/runtime-db.test.ts
git commit -m "feat(cli): add openProfileRuntimeDb helper"
```

### Task 6: `apps/cli/src/lib/docker-exec-pty.ts`

**Files:**
- Create: `apps/cli/src/lib/docker-exec-pty.ts`
- Create: `apps/cli/tests/lib/docker-exec-pty.test.ts`

- [ ] **Step 1: Write the failing test (uses a mock dockerode)**

```ts
// apps/cli/tests/lib/docker-exec-pty.test.ts
import { describe, expect, it, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { runDockerExecPty } from '../../src/lib/docker-exec-pty.js';

function makeFakeContainer(stdout: string) {
  return {
    exec: vi.fn().mockResolvedValue({
      start: vi.fn().mockResolvedValue({
        stdout: Readable.from([stdout]),
        stdin: new Writable({ write: (_c, _e, cb) => cb() }),
        wait: vi.fn().mockResolvedValue({ ExitCode: 0 }),
      }),
    }),
  };
}

describe('runDockerExecPty', () => {
  it('matches a regex against the streamed stdout (ANSI-stripped)', async () => {
    const fakeContainer = makeFakeContainer('Open: \x1b[32mhttps://example.com/oauth?state=xyz\x1b[0m');
    const onUrl = vi.fn();
    await runDockerExecPty({
      container: fakeContainer as never,
      cmd: ['claude', 'setup-token'],
      matchers: [
        { name: 'url', regex: /https:\/\/example\.com\/oauth\?state=([a-z]+)/, onMatch: onUrl },
      ],
      stdin: Readable.from([]),
    });
    expect(onUrl).toHaveBeenCalledWith(expect.stringContaining('https://example.com/oauth?state=xyz'));
  });

  it('forwards bytes from a stdin stream to the exec stdin', async () => {
    const writes: Buffer[] = [];
    const fakeContainer = {
      exec: vi.fn().mockResolvedValue({
        start: vi.fn().mockResolvedValue({
          stdout: Readable.from(['']),
          stdin: new Writable({
            write: (chunk, _e, cb) => {
              writes.push(chunk);
              cb();
            },
          }),
          wait: vi.fn().mockResolvedValue({ ExitCode: 0 }),
        }),
      }),
    };
    const stdin = Readable.from(['hello\r']);
    await runDockerExecPty({
      container: fakeContainer as never,
      cmd: ['claude', 'setup-token'],
      matchers: [],
      stdin,
    });
    expect(Buffer.concat(writes).toString()).toContain('hello\r');
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
pnpm --filter @zeno/cli test docker-exec-pty
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/cli/src/lib/docker-exec-pty.ts
import type Dockerode from 'dockerode';
import type { Readable } from 'node:stream';

const ANSI_REGEX = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

export interface PtyMatcher {
  name: string;
  regex: RegExp;
  /** Called with the first capture group (or full match if no group). At-most-once. */
  onMatch: (value: string) => void;
}

export interface RunDockerExecPtyOpts {
  container: Dockerode.Container;
  cmd: string[];
  /** Forwarded to the exec stdin stream. CLI typically passes process.stdin in raw mode. */
  stdin: Readable;
  matchers: PtyMatcher[];
  /** PTY columns. Default 200 (avoid wrapped URLs splitting across lines). */
  cols?: number;
  rows?: number;
}

export async function runDockerExecPty(opts: RunDockerExecPtyOpts): Promise<{ exitCode: number }> {
  const exec = await opts.container.exec({
    Cmd: opts.cmd,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
  });
  const stream = await exec.start({
    hijack: true,
    stdin: true,
  });

  let buffer = '';
  const fired = new Set<string>();

  const onData = (chunk: Buffer) => {
    process.stdout.write(chunk); // mirror to operator's terminal
    const stripped = chunk.toString().replace(ANSI_REGEX, '');
    buffer += stripped;
    for (const m of opts.matchers) {
      if (fired.has(m.name)) continue;
      const match = m.regex.exec(buffer);
      if (match) {
        fired.add(m.name);
        m.onMatch(match[1] ?? match[0]);
      }
    }
  };

  // dockerode multiplexed stream: when Tty=true, stream is plain (no header).
  stream.on('data', onData);
  opts.stdin.pipe(stream);

  await new Promise<void>((resolve) => stream.on('end', resolve));
  const inspect = await exec.inspect();
  return { exitCode: inspect.ExitCode ?? -1 };
}
```

(Adjust `dockerode` types if the install has slightly different surface — check `node_modules/@types/dockerode` if needed.)

- [ ] **Step 4: Run test (expect PASS)**

```bash
pnpm --filter @zeno/cli test docker-exec-pty
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/lib/docker-exec-pty.ts apps/cli/tests/lib/docker-exec-pty.test.ts
git commit -m "feat(cli): add runDockerExecPty helper"
```

### Task 7: `apps/cli/src/lib/claude-oauth.ts`

**Files:**
- Create: `apps/cli/src/lib/claude-oauth.ts`
- Create: `apps/cli/tests/lib/claude-oauth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/cli/tests/lib/claude-oauth.test.ts
import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { runClaudeOAuth } from '../../src/lib/claude-oauth.js';

describe('runClaudeOAuth', () => {
  it('returns the captured token after URL prompt + code paste', async () => {
    // Fake backend catalog entry
    const backend = {
      id: 'claude-code',
      auto_flow: {
        kind: 'spawn-cli',
        command: ['claude', 'setup-token'],
        stdout_url_regex: '(https://example\\.com/oauth\\?state=[a-z]+)',
        stdout_token_regex: '(sk-ant-oat\\d{2}-[A-Za-z0-9_-]+)',
        stdout_awaiting_code_regex: 'Paste\\s*code\\s*here',
      },
    };
    // Fake container that scripts the conversation
    const fakeContainer = {
      exec: vi.fn().mockResolvedValue({
        start: vi.fn().mockResolvedValue(
          (() => {
            const stream = Object.assign(Readable.from([
              'Open https://example.com/oauth?state=xyz\n',
              'Paste code here:\n',
              'sk-ant-oat01-ABCDEFGHIJ012345678901234567890ABCDEFGHIJ01234567890\n',
            ]), {
              write: (chunk: Buffer | string, _e?: unknown, cb?: () => void) => {
                cb?.();
                return true;
              },
            });
            return stream;
          })(),
        ),
        inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }),
      }),
    };
    const token = await runClaudeOAuth({
      container: fakeContainer as never,
      backend: backend as never,
      promptCode: async () => 'AUTHCODE',
    });
    expect(token).toBe('sk-ant-oat01-ABCDEFGHIJ012345678901234567890ABCDEFGHIJ01234567890');
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
pnpm --filter @zeno/cli test claude-oauth
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/cli/src/lib/claude-oauth.ts
import type Dockerode from 'dockerode';
import { PassThrough } from 'node:stream';
import { runDockerExecPty } from './docker-exec-pty.js';

export interface ClaudeOAuthOpts {
  container: Dockerode.Container;
  /** Catalog entry from @zeno/backends — uses `auto_flow.command` + the three regexes. */
  backend: {
    id: string;
    auto_flow: {
      command: string[];
      stdout_url_regex: string;
      stdout_token_regex: string;
      stdout_awaiting_code_regex?: string;
    };
  };
  /** Prompts the operator for the OAuth code. Hidden input recommended. */
  promptCode: (url: string) => Promise<string>;
}

/** Returns the captured OAuth token. Throws if the flow exits without a token. */
export async function runClaudeOAuth(opts: ClaudeOAuthOpts): Promise<string> {
  const flow = opts.backend.auto_flow;
  const urlRe = new RegExp(flow.stdout_url_regex);
  const tokenRe = new RegExp(flow.stdout_token_regex);
  const awaitingRe = flow.stdout_awaiting_code_regex
    ? new RegExp(flow.stdout_awaiting_code_regex)
    : null;

  const stdin = new PassThrough();
  let url: string | null = null;
  let token: string | null = null;

  const matchers = [
    {
      name: 'url',
      regex: urlRe,
      onMatch: (v: string) => {
        url = v;
      },
    },
    {
      name: 'token',
      regex: tokenRe,
      onMatch: (v: string) => {
        token = v;
      },
    },
  ];

  if (awaitingRe) {
    matchers.push({
      name: 'awaiting',
      regex: awaitingRe,
      onMatch: async () => {
        if (!url) return;
        const code = await opts.promptCode(url);
        stdin.write(`${code}\r`);
      },
    } as never);
  }

  await runDockerExecPty({
    container: opts.container,
    cmd: flow.command,
    stdin,
    matchers,
  });

  if (!token) {
    throw new Error('OAuth flow exited without capturing a token');
  }
  return token;
}
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
pnpm --filter @zeno/cli test claude-oauth
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/lib/claude-oauth.ts apps/cli/tests/lib/claude-oauth.test.ts
git commit -m "feat(cli): add runClaudeOAuth orchestrator"
```

### Task 8: `apps/cli/src/lib/backend-resolver.ts`

**Files:**
- Create: `apps/cli/src/lib/backend-resolver.ts`
- Create: `apps/cli/tests/lib/backend-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/cli/tests/lib/backend-resolver.test.ts
import { describe, expect, it } from 'vitest';
import { listSelectableBackends } from '../../src/lib/backend-resolver.js';

const fakeCatalog = {
  backends: [
    { id: 'claude-code', name: 'Claude Code' },
    { id: 'codex', name: 'Codex', _comingSoon: true },
  ],
};

describe('listSelectableBackends', () => {
  it('marks codex as not-implemented', () => {
    const items = listSelectableBackends(fakeCatalog as never);
    expect(items.find((i) => i.id === 'claude-code')?.implemented).toBe(true);
    expect(items.find((i) => i.id === 'codex')?.implemented).toBe(false);
  });

  it('only claude-code is implemented today', () => {
    const items = listSelectableBackends(fakeCatalog as never);
    const implemented = items.filter((i) => i.implemented).map((i) => i.id);
    expect(implemented).toEqual(['claude-code']);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
pnpm --filter @zeno/cli test backend-resolver
```

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/cli/src/lib/backend-resolver.ts
import type { BackendsCatalog } from '@zeno/backends';

const IMPLEMENTED_BACKENDS = new Set(['claude-code']);

export interface SelectableBackend {
  id: string;
  name: string;
  implemented: boolean;
}

export function listSelectableBackends(catalog: BackendsCatalog): SelectableBackend[] {
  return catalog.backends.map((b) => ({
    id: b.id,
    name: b.name,
    implemented: IMPLEMENTED_BACKENDS.has(b.id),
  }));
}
```

(Catalog type may need shape adjustment — check `packages/backends/src/catalog.ts`.)

- [ ] **Step 4: Run test (expect PASS)**

```bash
pnpm --filter @zeno/cli test backend-resolver
```

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/lib/backend-resolver.ts apps/cli/tests/lib/backend-resolver.test.ts
git commit -m "feat(cli): add listSelectableBackends helper"
```

---

## Phase 3 — `zeno backend` CLI subtree

### Task 9: `backend list` command

**Files:**
- Create: `apps/cli/src/commands/backend-list.ts`
- Create: `apps/cli/tests/commands/backend-list.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/cli/tests/commands/backend-list.test.ts
import { describe, expect, it } from 'vitest';
// Test the buildRows pure function (extract from the command)
import { buildBackendRows } from '../../src/commands/backend-list.js';

describe('buildBackendRows', () => {
  it('joins catalog backends with credential statuses', () => {
    const catalog = {
      backends: [
        { id: 'claude-code', name: 'Claude Code' },
        { id: 'codex', name: 'Codex' },
      ],
    };
    const statuses = [
      { backendId: 'claude-code', status: 'active', lastTestedAt: 1700000000000, lastAuthAlertAt: null },
    ];
    const rows = buildBackendRows(catalog as never, statuses as never);
    expect(rows).toEqual([
      { id: 'claude-code', name: 'Claude Code', status: 'active', lastTestedAt: 1700000000000 },
      { id: 'codex', name: 'Codex', status: 'not_configured', lastTestedAt: null },
    ]);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
pnpm --filter @zeno/cli test backend-list
```

- [ ] **Step 3: Write the command + helper**

```ts
// apps/cli/src/commands/backend-list.ts
import { defineCommand } from 'citty';
import { loadBackendsCatalog, type BackendsCatalog } from '@zeno/backends';
import type { BackendCredentialStatus } from '@zeno/db/runtime';
import { resolveProfile } from '../lib/resolvers.js';
import { openProfileRuntimeDb } from '../lib/runtime-db.js';
import { isQuiet, setQuiet } from '../lib/output.js';

export interface BackendRow {
  id: string;
  name: string;
  status: 'active' | 'expired' | 'untested' | 'failed' | 'not_configured';
  lastTestedAt: number | null;
}

export function buildBackendRows(
  catalog: BackendsCatalog,
  statuses: BackendCredentialStatus[],
): BackendRow[] {
  const byId = new Map(statuses.map((s) => [s.backendId, s] as const));
  return catalog.backends.map((b) => {
    const s = byId.get(b.id);
    return {
      id: b.id,
      name: b.name,
      status: s?.status ?? 'not_configured',
      lastTestedAt: s?.lastTestedAt ?? null,
    };
  });
}

export default defineCommand({
  meta: { name: 'list', description: 'list backends configured for a profile' },
  args: {
    profile: { type: 'positional', description: 'profile identifier', required: false },
    json: { type: 'boolean', description: 'emit JSON' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const profile = await resolveProfile(args.profile as string | undefined);
    const handle = openProfileRuntimeDb({
      workspaceDir: profile.workspaceDir,
      profileId: profile.id,
      masterKey: Buffer.from(profile.masterKey, 'base64'),
    });
    try {
      const catalog = loadBackendsCatalog();
      const statuses = handle.backendCredentialsRepo.listStatuses();
      const rows = buildBackendRows(catalog, statuses);
      if (args.json) {
        process.stdout.write(`${JSON.stringify(rows)}\n`);
        return;
      }
      for (const row of rows) {
        const ts = row.lastTestedAt ? new Date(row.lastTestedAt).toISOString() : 'never';
        console.log(`${row.id.padEnd(14)} ${row.status.padEnd(16)} ${ts}`);
      }
    } finally {
      handle.close();
    }
  },
});
```

(Adjust `resolveProfile`'s return shape if different — read `apps/cli/src/lib/resolvers.ts`.)

- [ ] **Step 4: Run test (expect PASS)**

```bash
pnpm --filter @zeno/cli test backend-list
```

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/backend-list.ts apps/cli/tests/commands/backend-list.test.ts
git commit -m "feat(cli): add zeno backend list"
```

### Task 10: `backend show` command

**Files:**
- Create: `apps/cli/src/commands/backend-show.ts`
- Create: `apps/cli/tests/commands/backend-show.test.ts`

- [ ] **Step 1: Write the failing test for the pure formatter**

```ts
// apps/cli/tests/commands/backend-show.test.ts
import { describe, expect, it } from 'vitest';
import { formatBackendDetail } from '../../src/commands/backend-show.js';

describe('formatBackendDetail', () => {
  it('renders status, scope, last test, rotated', () => {
    const out = formatBackendDetail({
      id: 'claude-code',
      name: 'Claude Code',
      status: 'active',
      lastTestedAt: 1700000000000,
      updatedAt: 1700000000000,
      scope: 'profile · aes-256-gcm',
    });
    expect(out).toContain('claude-code');
    expect(out).toContain('active');
    expect(out).toContain('profile · aes-256-gcm');
  });
});
```

- [ ] **Step 2: Run (FAIL)**

```bash
pnpm --filter @zeno/cli test backend-show
```

- [ ] **Step 3: Implement command + formatter**

```ts
// apps/cli/src/commands/backend-show.ts
import { defineCommand } from 'citty';
import { loadBackendsCatalog } from '@zeno/backends';
import { resolveProfile } from '../lib/resolvers.js';
import { openProfileRuntimeDb } from '../lib/runtime-db.js';

export interface BackendDetail {
  id: string;
  name: string;
  status: string;
  lastTestedAt: number | null;
  updatedAt: number | null;
  scope: string;
}

export function formatBackendDetail(d: BackendDetail): string {
  const ts = (n: number | null) => (n ? new Date(n).toISOString() : 'never');
  return [
    `${d.id} (${d.name})`,
    `  status     ${d.status}`,
    `  scope      ${d.scope}`,
    `  last test  ${ts(d.lastTestedAt)}`,
    `  rotated    ${ts(d.updatedAt)}`,
  ].join('\n');
}

export default defineCommand({
  meta: { name: 'show', description: 'show details for a backend' },
  args: {
    slug: { type: 'positional', description: 'backend slug', required: false },
    profile: { type: 'string' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    const profile = await resolveProfile(args.profile);
    const handle = openProfileRuntimeDb({
      workspaceDir: profile.workspaceDir,
      profileId: profile.id,
      masterKey: Buffer.from(profile.masterKey, 'base64'),
    });
    try {
      const catalog = loadBackendsCatalog();
      const slug = (args.slug as string | undefined) ?? 'claude-code'; // single-backend default
      const entry = catalog.backends.find((b) => b.id === slug);
      if (!entry) {
        process.stderr.write(`error: backend '${slug}' not in catalog\n`);
        process.exit(1);
      }
      const status = handle.backendCredentialsRepo.listStatuses().find((s) => s.backendId === slug);
      const detail: BackendDetail = {
        id: slug,
        name: entry.name,
        status: status?.status ?? 'not_configured',
        lastTestedAt: status?.lastTestedAt ?? null,
        updatedAt: status?.lastTestedAt ?? null, // approximate; replace if rotated_at column exists
        scope: 'profile · aes-256-gcm',
      };
      if (args.json) {
        process.stdout.write(`${JSON.stringify(detail)}\n`);
        return;
      }
      console.log(formatBackendDetail(detail));
    } finally {
      handle.close();
    }
  },
});
```

- [ ] **Step 4: Run (PASS)**

```bash
pnpm --filter @zeno/cli test backend-show
```

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/backend-show.ts apps/cli/tests/commands/backend-show.test.ts
git commit -m "feat(cli): add zeno backend show"
```

### Task 11: `backend configure` command

**Files:**
- Create: `apps/cli/src/commands/backend-configure.ts`
- Create: `apps/cli/tests/commands/backend-configure.test.ts`

- [ ] **Step 1: Write the failing test (covers: container-not-running guard + codex hard-block)**

```ts
// apps/cli/tests/commands/backend-configure.test.ts
import { describe, expect, it } from 'vitest';
import { assertContainerRunning, assertBackendImplemented } from '../../src/commands/backend-configure.js';

describe('assertContainerRunning', () => {
  it('throws with the canonical error when state is not running', () => {
    expect(() => assertContainerRunning('default', 'exited')).toThrowError(
      /profile 'default' container not running\. start it first: zeno start default/,
    );
  });

  it('does not throw when running', () => {
    expect(() => assertContainerRunning('default', 'running')).not.toThrow();
  });
});

describe('assertBackendImplemented', () => {
  it('throws for codex', () => {
    expect(() => assertBackendImplemented('codex')).toThrowError(/codex backend not implemented yet/);
  });

  it('does not throw for claude-code', () => {
    expect(() => assertBackendImplemented('claude-code')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run (FAIL)**

```bash
pnpm --filter @zeno/cli test backend-configure
```

- [ ] **Step 3: Implement**

```ts
// apps/cli/src/commands/backend-configure.ts
import { defineCommand } from 'citty';
import Docker from 'dockerode';
import { loadBackendsCatalog } from '@zeno/backends';
import { testClaudeToken } from '@zeno/backends';
import { promptHidden } from '../lib/prompt.js';
import { resolveProfile } from '../lib/resolvers.js';
import { openProfileRuntimeDb } from '../lib/runtime-db.js';
import { runClaudeOAuth } from '../lib/claude-oauth.js';
import { containerNameForProfile } from '../lib/docker.js'; // assumed existing helper from spec 0050

const IMPLEMENTED = new Set(['claude-code']);

export function assertContainerRunning(profileName: string, state: string): void {
  if (state !== 'running') {
    throw new Error(`profile '${profileName}' container not running. start it first: zeno start ${profileName}`);
  }
}

export function assertBackendImplemented(slug: string): void {
  if (!IMPLEMENTED.has(slug)) {
    throw new Error(`${slug} backend not implemented yet`);
  }
}

export default defineCommand({
  meta: { name: 'configure', description: 'configure a backend (interactive OAuth flow)' },
  args: {
    profile: { type: 'string' },
  },
  async run({ args }) {
    const profile = await resolveProfile(args.profile);
    const docker = new Docker();
    const container = docker.getContainer(containerNameForProfile(profile.name));
    const inspect = await container.inspect();
    assertContainerRunning(profile.name, inspect.State.Status);

    const catalog = loadBackendsCatalog();
    // Picker / single-backend default
    const slug = 'claude-code'; // TODO: when codex adds, surface a picker via lib/picker
    assertBackendImplemented(slug);
    const backend = catalog.backends.find((b) => b.id === slug)!;

    const handle = openProfileRuntimeDb({
      workspaceDir: profile.workspaceDir,
      profileId: profile.id,
      masterKey: Buffer.from(profile.masterKey, 'base64'),
    });
    try {
      const token = await runClaudeOAuth({
        container,
        backend: backend as never,
        promptCode: async (url) => {
          process.stdout.write(`\nOpen this URL in your browser:\n  ${url}\n\n`);
          return promptHidden('paste code from browser: ');
        },
      });
      handle.backendCredentialsRepo.upsert({
        backendId: slug,
        fieldName: 'oauth_token',
        value: token,
      });
      const result = await testClaudeToken({ token, model: backend.test.model });
      if (result.kind === 'ok') {
        handle.backendCredentialsRepo.setStatus(slug, 'active', Date.now());
        console.log(`${slug} · active`);
        process.exit(0);
      }
      if (result.kind === 'unauthorized') {
        handle.backendCredentialsRepo.setStatus(slug, 'expired', Date.now());
        process.stderr.write(`${slug} · expired token captured · re-run zeno backend configure\n`);
        process.exit(1);
      }
      handle.backendCredentialsRepo.setStatus(slug, 'untested', Date.now());
      process.stderr.write(`${slug} · network error during test ping\n`);
      process.exit(2);
    } finally {
      handle.close();
    }
  },
});
```

(`containerNameForProfile` helper exists from spec 0050; verify by grep.)

- [ ] **Step 4: Run unit tests (PASS for the two assert* helpers)**

```bash
pnpm --filter @zeno/cli test backend-configure
```

Note: the full `run({})` flow is verified manually in Phase 11 (E2E). Unit tests cover the pure assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/backend-configure.ts apps/cli/tests/commands/backend-configure.test.ts
git commit -m "feat(cli): add zeno backend configure"
```

### Task 12: `backend rotate` command

**Files:**
- Create: `apps/cli/src/commands/backend-rotate.ts`

- [ ] **Step 1: Implement (thin wrapper around configure with a confirm prompt)**

```ts
// apps/cli/src/commands/backend-rotate.ts
import { defineCommand } from 'citty';
import { confirm } from '../lib/prompt.js';
import { resolveProfile } from '../lib/resolvers.js';
import configureCmd from './backend-configure.js';

export default defineCommand({
  meta: { name: 'rotate', description: 'rotate credentials for an existing backend' },
  args: {
    slug: { type: 'positional', required: false },
    profile: { type: 'string' },
  },
  async run({ args }) {
    const profile = await resolveProfile(args.profile);
    const slug = (args.slug as string | undefined) ?? 'claude-code';
    const ok = await confirm(`rotate ${slug} creds for profile=${profile.name}?`, false);
    if (!ok) {
      process.stderr.write('aborted\n');
      process.exit(130);
    }
    // Delegate to configure (overwrites the existing row via upsert)
    return configureCmd.run!({ args, rawArgs: [], cmd: configureCmd } as never);
  },
});
```

- [ ] **Step 2: Build + typecheck**

```bash
pnpm --filter @zeno/cli typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/cli/src/commands/backend-rotate.ts
git commit -m "feat(cli): add zeno backend rotate"
```

### Task 13: `backend test` command

**Files:**
- Create: `apps/cli/src/commands/backend-test.ts`
- Create: `apps/cli/tests/commands/backend-test.test.ts`

- [ ] **Step 1: Write failing test for `mapTestResultToExit`**

```ts
// apps/cli/tests/commands/backend-test.test.ts
import { describe, expect, it } from 'vitest';
import { mapTestResultToExit } from '../../src/commands/backend-test.js';

describe('mapTestResultToExit', () => {
  it.each([
    [{ kind: 'ok' }, 0],
    [{ kind: 'unauthorized' }, 1],
    [{ kind: 'rate_limited' }, 1],
    [{ kind: 'network', message: '' }, 2],
  ] as const)('maps %j → exit %i', (result, code) => {
    expect(mapTestResultToExit(result as never)).toBe(code);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

- [ ] **Step 3: Implement**

```ts
// apps/cli/src/commands/backend-test.ts
import { defineCommand } from 'citty';
import { loadBackendsCatalog, testClaudeToken, type ClaudeTestResult } from '@zeno/backends';
import { resolveProfile } from '../lib/resolvers.js';
import { openProfileRuntimeDb } from '../lib/runtime-db.js';

export function mapTestResultToExit(r: ClaudeTestResult): number {
  if (r.kind === 'ok') return 0;
  if (r.kind === 'unauthorized') return 1;
  if (r.kind === 'rate_limited') return 1;
  return 2; // network
}

export default defineCommand({
  meta: { name: 'test', description: 'test a backend by hitting its provider API' },
  args: {
    slug: { type: 'positional', required: false },
    profile: { type: 'string' },
    json: { type: 'boolean' },
    quiet: { type: 'boolean' },
  },
  async run({ args }) {
    const profile = await resolveProfile(args.profile);
    const handle = openProfileRuntimeDb({
      workspaceDir: profile.workspaceDir,
      profileId: profile.id,
      masterKey: Buffer.from(profile.masterKey, 'base64'),
    });
    try {
      const slug = (args.slug as string | undefined) ?? 'claude-code';
      const catalog = loadBackendsCatalog();
      const backend = catalog.backends.find((b) => b.id === slug);
      if (!backend) {
        process.stderr.write(`error: backend '${slug}' not in catalog\n`);
        process.exit(1);
      }
      const token = handle.backendCredentialsRepo.getValue(slug, 'oauth_token');
      if (!token) {
        process.stderr.write(`error: no credentials for '${slug}'. run: zeno backend configure\n`);
        process.exit(1);
      }
      const start = Date.now();
      const result = await testClaudeToken({ token, model: backend.test.model });
      const ms = Date.now() - start;
      const status = result.kind === 'ok' ? 'active' : result.kind === 'unauthorized' ? 'expired' : 'untested';
      handle.backendCredentialsRepo.setStatus(slug, status, Date.now());

      if (args.json) {
        process.stdout.write(`${JSON.stringify({ slug, status, ms, ts: new Date().toISOString(), kind: result.kind })}\n`);
      } else if (!args.quiet || result.kind !== 'ok') {
        const tail = result.kind === 'ok' ? `· ${ms}ms` : `· ${result.kind}`;
        console.log(`${slug} · ${status} ${tail}`);
      }
      process.exit(mapTestResultToExit(result));
    } finally {
      handle.close();
    }
  },
});
```

- [ ] **Step 4: Run (PASS)**

```bash
pnpm --filter @zeno/cli test backend-test
```

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/backend-test.ts apps/cli/tests/commands/backend-test.test.ts
git commit -m "feat(cli): add zeno backend test"
```

### Task 14: `backend remove` command

**Files:**
- Create: `apps/cli/src/commands/backend-remove.ts`

- [ ] **Step 1: Implement**

```ts
// apps/cli/src/commands/backend-remove.ts
import { defineCommand } from 'citty';
import { confirm } from '../lib/prompt.js';
import { resolveProfile } from '../lib/resolvers.js';
import { openProfileRuntimeDb } from '../lib/runtime-db.js';

export default defineCommand({
  meta: { name: 'remove', description: 'remove a backend\'s credentials' },
  args: {
    slug: { type: 'positional', required: false },
    profile: { type: 'string' },
  },
  async run({ args }) {
    const profile = await resolveProfile(args.profile);
    const slug = (args.slug as string | undefined) ?? 'claude-code';
    const ok = await confirm(`remove ${slug} from profile=${profile.name}? this clears credentials.`, false);
    if (!ok) {
      process.stderr.write('aborted\n');
      process.exit(130);
    }
    const handle = openProfileRuntimeDb({
      workspaceDir: profile.workspaceDir,
      profileId: profile.id,
      masterKey: Buffer.from(profile.masterKey, 'base64'),
    });
    try {
      handle.backendCredentialsRepo.deleteAll(slug); // assumes deleteAll exists; otherwise add
      console.log(`removed ${slug}`);
    } finally {
      handle.close();
    }
  },
});
```

If `BackendCredentialsRepo.deleteAll(backendId)` doesn't exist, add it (single SQL `delete` against `(profileId, backendId)`). Same task adds to `packages/db/src/runtime/repos/backend-credentials.ts`.

- [ ] **Step 2: Add `deleteAll` to repo (if missing)**

```ts
// packages/db/src/runtime/repos/backend-credentials.ts (append in class)
deleteAll(backendId: string): void {
  this.db.delete(backendCredentials)
    .where(
      and(
        eq(backendCredentials.profileId, this.opts.profileId),
        eq(backendCredentials.backendId, backendId),
      ),
    )
    .run();
}
```

- [ ] **Step 3: Build + typecheck**

```bash
pnpm --filter @zeno/cli typecheck
pnpm --filter @zeno/db typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/commands/backend-remove.ts packages/db/src/runtime/repos/backend-credentials.ts
git commit -m "feat(cli): add zeno backend remove"
```

### Task 15: Register `backend` parent in `apps/cli/src/index.ts`

**Files:**
- Create: `apps/cli/src/commands/backend.ts` (parent that mounts the 6 subcommands)
- Modify: `apps/cli/src/index.ts`

- [ ] **Step 1: Create parent command**

```ts
// apps/cli/src/commands/backend.ts
import { defineCommand } from 'citty';
import list from './backend-list.js';
import show from './backend-show.js';
import configure from './backend-configure.js';
import rotate from './backend-rotate.js';
import test from './backend-test.js';
import remove from './backend-remove.js';

export default defineCommand({
  meta: { name: 'backend', description: 'manage agent backend (claude-code) credentials' },
  subCommands: { list, show, configure, rotate, test, remove },
});
```

- [ ] **Step 2: Register in `apps/cli/src/index.ts`**

Inside the `subCommands` map, add:

```ts
backend: () => import('./commands/backend.js').then((m) => m.default),
```

(Match the lazy-import pattern of the existing entries — read the file head.)

- [ ] **Step 3: Smoke test**

```bash
pnpm --filter @zeno/cli build
node apps/cli/dist/index.js backend --help
```

Expected: lists `list`, `show`, `configure`, `rotate`, `test`, `remove`.

- [ ] **Step 4: Phase 3 quality gate**

```bash
pnpm run quality-gate
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/backend.ts apps/cli/src/index.ts
git commit -m "feat(cli): register zeno backend subtree"
```

---

## Phase 4 — Dashboard `/backend` page + sidebar

### Task 16: Add `backend` to NavId + sidebar entry

**Files:**
- Modify: `apps/dashboard/src/components/layout/dashboard-sidebar.tsx`

- [ ] **Step 1: Read current sidebar**

```bash
cat apps/dashboard/src/components/layout/dashboard-sidebar.tsx | head -120
```

Identify `NavId` union, `navIdForPath`, and the JSX list of nav entries.

- [ ] **Step 2: Edit — add `'backend'` to union, add path branch, add JSX entry**

```ts
// NavId union — add
type NavId = 'home' | 'backend' | 'crons' | 'channels' | 'connectors' | 'skills' | 'settings';

// navIdForPath — add branch (first one after home)
if (path === '/backend' || path.startsWith('/backend/')) return 'backend';

// JSX list — insert between home and crons
<NavLink to="/backend" id="backend" icon={<Cpu />} label="backend" shortcut="⌘B" />
```

(Match the exact prop names of the existing `NavLink` component. The `Cpu` icon comes from `lucide-react` — same as other icons.)

- [ ] **Step 3: Verify TS exhaustiveness**

```bash
pnpm --filter @zeno/dashboard typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/layout/dashboard-sidebar.tsx
git commit -m "feat(dashboard): add 'backend' nav entry between home and crons"
```

### Task 17: `BackendActionModal` component

**Files:**
- Create: `apps/dashboard/src/components/backend/backend-action-modal.tsx`

- [ ] **Step 1: Implement (mirror existing CommandModal pattern in connectors)**

```tsx
// apps/dashboard/src/components/backend/backend-action-modal.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@zeno/ui/dialog';
import { Button } from '@zeno/ui/button';
import { Copy, ExternalLink } from 'lucide-react';

export type BackendActionKind = 'test' | 'rotate' | 'configure';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: BackendActionKind;
  slug: string;
}

const COMMANDS: Record<BackendActionKind, string> = {
  test: 'zeno backend test',
  rotate: 'zeno backend rotate',
  configure: 'zeno backend configure',
};

const DOCS_URL = 'https://github.com/ribeirogab/zeno-agent#backend';

export function BackendActionModal(props: Props) {
  const cmd = `${COMMANDS[props.kind]} ${props.slug}`.trim();
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.kind} {props.slug}</DialogTitle>
        </DialogHeader>
        <pre className="bg-muted p-3 rounded font-mono text-sm">$ {cmd}</pre>
        <div className="flex gap-2">
          <Button onClick={() => navigator.clipboard.writeText(cmd)}>
            <Copy className="mr-2 h-4 w-4" /> COPY
          </Button>
          <Button asChild variant="outline">
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              DOCS <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

(Component imports adjusted to actual `@zeno/ui` exports — read package's `index.ts` if uncertain.)

- [ ] **Step 2: Build + typecheck**

```bash
pnpm --filter @zeno/dashboard typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/backend/backend-action-modal.tsx
git commit -m "feat(dashboard): add BackendActionModal (CLI snippet + COPY + DOCS)"
```

### Task 18: `BackendRow` component

**Files:**
- Create: `apps/dashboard/src/components/backend/backend-row.tsx`

- [ ] **Step 1: Implement (mirrors Paper V2 compact row layout)**

```tsx
// apps/dashboard/src/components/backend/backend-row.tsx
import { useState } from 'react';
import { BackendActionModal, type BackendActionKind } from './backend-action-modal.js';

interface BackendRowProps {
  slug: string;
  name: string;
  status: 'active' | 'expired' | 'untested' | 'failed' | 'not_configured';
  lastTestedAt: number | null;
  scope: string;
  implemented: boolean; // codex = false
}

const STATUS_TO_COLOR: Record<BackendRowProps['status'], string> = {
  active: 'text-[#6BCB77]',
  expired: 'text-[#E8617A]',
  untested: 'text-[#8A8FA3]',
  failed: 'text-[#E8617A]',
  not_configured: 'text-[#6F7388]',
};

export function BackendRow(props: BackendRowProps) {
  const [modal, setModal] = useState<BackendActionKind | null>(null);
  const tsLabel = props.lastTestedAt
    ? new Date(props.lastTestedAt).toISOString().slice(0, 16).replace('T', ' ')
    : 'never';
  return (
    <>
      <div className="flex gap-4 px-4 py-4 border-b border-border items-center">
        {/* logo + name (320px) */}
        <div className="w-[320px] flex gap-3 items-center">
          <div className="w-8 h-8 bg-muted rounded" />
          <div className="flex flex-col gap-1">
            <div className="font-mono text-sm font-semibold">{props.slug}</div>
            <div className="font-mono text-xs text-muted-foreground">{props.name}</div>
          </div>
        </div>
        <div className={`w-[110px] font-mono text-xs uppercase ${STATUS_TO_COLOR[props.status]}`}>
          {props.status === 'not_configured' ? 'NOT CONFIGURED' : props.status.toUpperCase()}
        </div>
        <div className="w-[180px] font-mono text-xs text-muted-foreground">{tsLabel}</div>
        <div className="w-[130px] font-mono text-xs text-muted-foreground">{props.scope}</div>
        <div className="flex-1 flex justify-end gap-2">
          {props.implemented && props.status === 'active' && (
            <>
              <button onClick={() => setModal('test')} className="px-3 py-1 border rounded text-xs">TEST</button>
              <button onClick={() => setModal('rotate')} className="px-3 py-1 border rounded text-xs">ROTATE</button>
            </>
          )}
          {props.implemented && (
            <button onClick={() => setModal('configure')} className="px-3 py-1 border rounded text-xs">CONFIGURE</button>
          )}
        </div>
      </div>
      {modal && (
        <BackendActionModal open onOpenChange={() => setModal(null)} kind={modal} slug={props.slug} />
      )}
    </>
  );
}
```

(Tailwind classes match Imperial Terminal tokens. Replace literal hex with token classes if `@zeno/ui` exposes them.)

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @zeno/dashboard typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/backend/backend-row.tsx
git commit -m "feat(dashboard): add BackendRow component"
```

### Task 19: `/backend` route page

**Files:**
- Create: `apps/dashboard/src/routes/_authed/backend.tsx`
- Modify: `apps/dashboard/src/lib/use-backends.ts` (verify `useBackends({ poll })` already supports a 30s default; if not, add)

- [ ] **Step 1: Create route**

```tsx
// apps/dashboard/src/routes/_authed/backend.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useBackends } from '@/lib/use-backends';
import { BackendRow } from '@/components/backend/backend-row';

const IMPLEMENTED = new Set(['claude-code']);

function BackendPage() {
  const { data, isLoading } = useBackends();
  if (isLoading) return <div className="p-12">loading…</div>;
  return (
    <div className="bg-[#08090F] flex flex-col gap-9 p-[60px_54px]">
      <div className="flex flex-col gap-3.5">
        <div className="font-mono text-[11px] tracking-widest uppercase text-[#4B4F66]">RUNTIME</div>
        <h1 className="font-serif text-[40px] text-foreground">backend</h1>
        <p className="font-mono text-sm text-muted-foreground max-w-[720px]">
          Agent runtimes installed in this profile. CLI mutates · dashboard reads. Configure each backend with{' '}
          <span className="text-[#D9B362]">zeno backend configure</span>.
        </p>
      </div>
      <div className="flex flex-col">
        <div className="flex gap-4 px-4 py-2 border-b border-border font-mono text-[10px] tracking-widest uppercase text-[#4B4F66]">
          <div className="w-[320px]">BACKEND</div>
          <div className="w-[110px]">STATUS</div>
          <div className="w-[180px]">LAST TEST</div>
          <div className="w-[130px]">SCOPE</div>
          <div className="flex-1 text-right">ACTION</div>
        </div>
        {(data ?? []).map((b) => (
          <BackendRow
            key={b.id}
            slug={b.id}
            name={b.name}
            status={b.status}
            lastTestedAt={b.lastTestedAt ?? null}
            scope="profile · aes-256-gcm"
            implemented={IMPLEMENTED.has(b.id)}
          />
        ))}
      </div>
      <div className="font-mono text-xs text-[#4B4F66]">
        catalog · agent/backends-catalog.json · {data?.length ?? 0} entries · pluggable surface
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_authed/backend')({
  component: BackendPage,
});
```

- [ ] **Step 2: Run dev server + verify (preview tools)**

```bash
pnpm --filter @zeno/dashboard dev
```

Then via the preview MCP: navigate to `/backend`, snapshot, screenshot. Match against Paper artboard `1B8A-0`.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/routes/_authed/backend.tsx
git commit -m "feat(dashboard): add /backend top-level page"
```

---

## Phase 5 — `/settings` cleanup

### Task 20: Remove BACKEND tab + replace header copy

**Files:**
- Modify: `apps/dashboard/src/routes/_authed/settings.tsx` (and any sub-routes that share the tab strip)

- [ ] **Step 1: Find and remove the BACKEND tab JSX entry**

```bash
grep -n "BACKEND\|backend" apps/dashboard/src/routes/_authed/settings.tsx
```

Edit out the BACKEND tab; verify the remaining tabs are PROFILE | CAPABILITIES | ABOUT.

- [ ] **Step 2: Replace the header description**

The new copy (verbatim per spec):

```
Edit USER.md inline; flip capabilities. Worker auto-reloads on profile changes. Backend lives at /backend.
```

- [ ] **Step 3: Verify in browser via preview**

Snapshot `/settings`, confirm three tabs and new copy.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/routes/_authed/settings.tsx
git commit -m "feat(dashboard): drop BACKEND tab from /settings"
```

### Task 21: 301 redirect `/settings/backend` → `/backend`

**Files:**
- Modify: existing `apps/dashboard/src/routes/_authed/settings/backend.tsx` (or whatever the file is)

- [ ] **Step 1: Replace with redirect-only route**

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/settings/backend')({
  beforeLoad: () => {
    throw redirect({ to: '/backend' });
  },
});
```

- [ ] **Step 2: Verify**

Navigate to `/settings/backend` in dev — expect immediate redirect to `/backend`.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/routes/_authed/settings/backend.tsx
git commit -m "feat(dashboard): redirect /settings/backend to /backend"
```

---

## Phase 6 — Delete dashboard mutation surfaces

### Task 22: Delete `ActiveBackendSelector` component + its imports

**Files:**
- Delete: `apps/dashboard/src/components/settings/active-backend-selector.tsx`
- Modify: every file that imports it

- [ ] **Step 1: Find importers**

```bash
grep -Rn "ActiveBackendSelector" apps/dashboard/src
```

- [ ] **Step 2: Remove imports + JSX usage** in each file

- [ ] **Step 3: Delete the component file**

```bash
git rm apps/dashboard/src/components/settings/active-backend-selector.tsx
```

- [ ] **Step 4: Verify zero matches**

```bash
grep -Rn "ActiveBackendSelector" apps/dashboard/src
```

Expected: no output.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @zeno/dashboard typecheck
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(dashboard): delete ActiveBackendSelector component"
```

### Task 23: Delete configure modal flows

**Files:**
- Delete: every `*configure-claude*.tsx`, `*oauth*.tsx` under `apps/dashboard/src/components/settings/` (and any related)

- [ ] **Step 1: Locate**

```bash
find apps/dashboard/src -name '*configure-claude*' -o -name '*backend-oauth*'
```

- [ ] **Step 2: Delete + grep + remove imports** (same pattern as Task 22)

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add -A
git commit -m "refactor(dashboard): delete backend configure modal components"
```

### Task 24: Drop mutation hooks from `use-backends.ts`

**Files:**
- Modify: `apps/dashboard/src/lib/use-backends.ts`

- [ ] **Step 1: Open and remove**

Delete:
- `useSaveBackendCredentials`
- `useStartOAuth`
- `useSetActiveBackend`

Keep:
- `useBackends`
- any other GET-only hook

- [ ] **Step 2: Verify zero matches**

```bash
grep -R "useSaveBackendCredentials\|useStartOAuth\|useSetActiveBackend" apps/dashboard/src
```

Expected: no output.

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/lib/use-backends.ts
git commit -m "refactor(dashboard): drop backend mutation hooks"
```

---

## Phase 7 — Delete api mutation routes

### Task 25: Delete mutation handlers in `apps/api/src/routes/backends.ts`

**Files:**
- Modify: `apps/api/src/routes/backends.ts`

- [ ] **Step 1: Identify routes to keep**

Keep handlers for:
- `GET /api/backends`
- `GET /api/backends/:slug`
- `POST /api/backends/:slug/test`

Delete:
- `POST /api/backends/:slug/credentials`
- `POST /api/backends/:slug/oauth/start`
- `GET /api/backends/:slug/oauth/:session/stream`
- `POST /api/backends/:slug/oauth/:session/input`
- `PUT /api/backends/active`

- [ ] **Step 2: Edit file**

Remove the handler blocks + their helpers. Drop unused imports (`oauth-sessions`, `randomUUID`, etc.).

- [ ] **Step 3: Update tests**

```bash
grep -Rn "credentials\|oauth/start\|active.*PUT" apps/api/tests/routes/backends.test.ts
```

Delete the corresponding `it(...)` blocks.

- [ ] **Step 4: Typecheck + test**

```bash
pnpm --filter @zeno/api typecheck
pnpm --filter @zeno/api test
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/backends.ts apps/api/tests/routes/backends.test.ts
git commit -m "refactor(api): drop backend mutation routes (CLI-only)"
```

### Task 26: Delete `oauth-sessions.ts`

**Files:**
- Delete: `apps/api/src/lib/oauth-sessions.ts`
- Delete: any test for it

- [ ] **Step 1: Verify zero importers**

```bash
grep -R "oauth-sessions" apps/ packages/
```

Expected: no output (Task 25 already removed the only consumer).

- [ ] **Step 2: Delete**

```bash
git rm apps/api/src/lib/oauth-sessions.ts
[ -f apps/api/tests/lib/oauth-sessions.test.ts ] && git rm apps/api/tests/lib/oauth-sessions.test.ts || true
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @zeno/api typecheck
git add -A
git commit -m "refactor(api): delete oauth-sessions module"
```

---

## Phase 8 — Onboarding rename

### Task 27: Rename `/onboarding/connect-claude` → `/onboarding/connect-backend`

**Files:**
- Rename: `apps/dashboard/src/routes/onboarding.connect-claude.tsx` → `apps/dashboard/src/routes/onboarding.connect-backend.tsx`
- Modify: `apps/dashboard/src/routes/_authed/index.tsx` (gate redirect target)

- [ ] **Step 1: Rename file**

```bash
git mv apps/dashboard/src/routes/onboarding.connect-claude.tsx apps/dashboard/src/routes/onboarding.connect-backend.tsx
```

- [ ] **Step 2: Update file's `createFileRoute('...')` path string**

```tsx
export const Route = createFileRoute('/onboarding/connect-backend')({ ... });
```

- [ ] **Step 3: Update gate**

In `apps/dashboard/src/routes/_authed/index.tsx`:

```ts
throw redirect({ to: '/onboarding/connect-backend' });
```

- [ ] **Step 4: Grep for stragglers**

```bash
grep -Rn "onboarding/connect-claude\|connect-claude" apps/dashboard/src
```

Update any remaining references.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(dashboard): rename onboarding/connect-claude to connect-backend"
```

### Task 28: Update onboarding hero per Paper B4 + 2s polling

**Files:**
- Modify: `apps/dashboard/src/routes/onboarding.connect-backend.tsx` (UI body)

- [ ] **Step 1: Replace UI body**

Match Paper B4 (`1AWS-0`):
- Hero: `Welcome to Zeno.`
- Subtitle: brief intro
- Command card: `$ zeno backend configure` + COPY + DOCS↗
- Helper line: `claude-code · codex · gemini · pluggable surface`
- Indicator: `waiting for CLI run · polls every 2s`

Plus 2s polling via `useBackends({ refetchInterval: 2000 })` (extend the hook signature if needed).

- [ ] **Step 2: Auto-redirect on first ACTIVE**

```tsx
const { data } = useBackends({ refetchInterval: 2000 });
useEffect(() => {
  if (data?.some((b) => b.status === 'active')) {
    navigate({ to: '/backend' });
  }
}, [data, navigate]);
```

- [ ] **Step 3: Verify visually**

`pnpm --filter @zeno/dashboard dev` then navigate to `/onboarding/connect-backend`. Match Paper B4.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/routes/onboarding.connect-backend.tsx
git commit -m "feat(dashboard): CLI-first onboarding hero + 2s polling + auto-redirect"
```

### Task 29: Add 301 redirect from legacy path

**Files:**
- Create: `apps/dashboard/src/routes/onboarding.connect-claude.tsx` (NEW, redirect-only)

- [ ] **Step 1: Add tiny redirect route**

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/onboarding/connect-claude')({
  beforeLoad: () => {
    throw redirect({ to: '/onboarding/connect-backend' });
  },
});
```

- [ ] **Step 2: Verify**

Navigate to `/onboarding/connect-claude` → immediate redirect.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/routes/onboarding.connect-claude.tsx
git commit -m "feat(dashboard): legacy redirect connect-claude → connect-backend"
```

---

## Phase 9 — Drop `ZENO_BACKEND` env

### Task 30: Worker boot

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Replace env read with DB read**

Find `process.env.ZENO_BACKEND ?? 'claude-code'` (line ~91 per spec).
Replace with:

```ts
const activeBackendId =
  backendSettingsRepo.get('active_backend_id') ?? 'claude-code';
```

(Use the already-instantiated `backendSettingsRepo`. Check the file head for its variable name.)

- [ ] **Step 2: Find and update other reads**

```bash
grep -n "ZENO_BACKEND" apps/worker/src/index.ts
```

Apply the same replacement everywhere.

- [ ] **Step 3: Build + typecheck**

```bash
pnpm --filter @zeno/worker typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "refactor(worker): read active backend from DB, drop ZENO_BACKEND env"
```

### Task 31: API settings route

**Files:**
- Modify: `apps/api/src/routes/settings.ts`

- [ ] **Step 1: Replace env read**

Find the `process.env.ZENO_BACKEND ?? 'claude-code'` line (~65).
Replace with `backendSettingsRepo.get('active_backend_id') ?? 'claude-code'`.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @zeno/api typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/settings.ts
git commit -m "refactor(api): drop ZENO_BACKEND env from settings route"
```

### Task 32: Mock backend driver

**Files:**
- Modify: `apps/worker/src/agent/backends/mock.ts`

- [ ] **Step 1: Remove env-read selection logic**

The mock driver should be selectable via `active_backend_id = 'mock'` in the runtime DB, not via env.

Find any `process.env.ZENO_BACKEND` reference. Delete.

If the driver is registered via a registry switch, ensure `'mock'` is a registered key (no env precondition).

- [ ] **Step 2: Verify zero env reads anywhere**

```bash
grep -R "process.env.ZENO_BACKEND" apps/ packages/
```

Expected: no output. **THIS IS A HARD ACCEPTANCE CRITERION.**

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @zeno/worker typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/agent/backends/mock.ts
git commit -m "refactor(worker): mock backend selectable via DB only"
```

---

## Phase 10 — E2E mock fixture

### Task 33: Create `tests/e2e/fixtures/mock-backend.ts`

**Files:**
- Create: `tests/e2e/fixtures/mock-backend.ts`

- [ ] **Step 1: Implement**

```ts
// tests/e2e/fixtures/mock-backend.ts
import { openRuntimeDatabase, runRuntimeMigrations, BackendCredentialsRepo, BackendSettingsRepo } from '@zeno/db/runtime';
import { join } from 'node:path';

export interface SeedMockBackendOpts {
  workspaceDir: string;
  profileId: string;
  masterKey: Buffer;
}

export function seedMockBackend(opts: SeedMockBackendOpts): void {
  const opened = openRuntimeDatabase(join(opts.workspaceDir, 'zeno.db'));
  runRuntimeMigrations(opened.db);
  const creds = new BackendCredentialsRepo(opened.db, { masterKey: opts.masterKey, profileId: opts.profileId });
  const settings = new BackendSettingsRepo(opened.db, opts.profileId);
  creds.upsert({ backendId: 'mock', fieldName: 'noop', value: 'noop' });
  creds.setStatus('mock', 'active', Date.now());
  settings.set('active_backend_id', 'mock');
  opened.sqlite.close();
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/fixtures/mock-backend.ts
git commit -m "test(e2e): add mock-backend DB seed fixture"
```

### Task 34: Update existing E2E tests to use the fixture

**Files:**
- Modify: every existing E2E test that boots the worker

- [ ] **Step 1: Find boot helpers**

```bash
grep -Rn "ZENO_BACKEND\|boot-zeno" tests/e2e
```

- [ ] **Step 2: Remove `ZENO_BACKEND=mock` env settings**

In every fixture / compose / shell script under `tests/e2e/`, delete `ZENO_BACKEND=mock`.

- [ ] **Step 3: Call `seedMockBackend(...)` after the workspace dir + master key are ready, before starting the worker**

Adapt to the existing fixture structure (likely `boot-zeno.ts`).

- [ ] **Step 4: Run E2E**

```bash
pnpm --filter @zeno/e2e test
# or whatever the e2e command is — check root package.json
```

Expected: PASS with no env changes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(e2e): switch mock backend selection from env to DB seed"
```

---

## Phase 11 — E2E real (Slack DM) + Paper clean reviews

### Task 35: Manual end-to-end + 3 rounds clean review per artboard + final

This task is manual. Do not skip steps.

- [ ] **Step 1: Reset to a clean state**

```bash
docker compose down
rm -rf ~/.zeno/profiles/test-0072
zeno profile create test-0072
zeno start test-0072
```

- [ ] **Step 2: Verify onboarding redirect**

Open `zeno open test-0072`. Expect redirect to `/onboarding/connect-backend`. Confirm hero matches Paper B4 (`1AWS-0`).

- [ ] **Step 3: Run `zeno backend configure` in another terminal**

```bash
zeno backend configure --profile test-0072
```

Walk through the OAuth flow: open URL, paste code. Verify the dashboard auto-redirects to `/backend` within ~5s.

- [ ] **Step 4: Slack DM test**

DM the agent in Slack. Verify worker logs show `backend=claude-code` and the response arrives.

- [ ] **Step 5: Force expired and verify banner**

```bash
sqlite3 ~/.zeno/profiles/test-0072/runtime/zeno.db "UPDATE backend_credentials SET status='expired' WHERE backend_id='claude-code';"
```

Reload `/backend`. Confirm EXPIRED banner per Paper B3.

- [ ] **Step 6: Rotate**

```bash
zeno backend rotate claude-code --profile test-0072
```

Walk through OAuth again. Status flips back to `active`. Slack DM works.

- [ ] **Step 7: Three rounds clean review per Paper artboard**

For each of: B1 (`1B8A-0`), B2 (`1AO8-0`), B3 (`1ASI-0`), B4 (`1AWS-0`), B5 (settings sub-nav `16KQ-0` etc.):

- Round 1: snapshot dashboard → diff against Paper. Fix any difference. Commit.
- Round 2: snapshot → diff. Fix. Commit.
- Round 3: snapshot → diff. Must be clean. Commit if not.

If any round finds a diff, restart the count for that artboard.

- [ ] **Step 8: Final consolidated review**

One pass over all 5 artboards together. Must be clean.

---

## Phase 12 — Quality gate + PR

### Task 36: Final gate + open PR

- [ ] **Step 1: Full quality gate**

```bash
pnpm run quality-gate
```

Expected: PASS.

- [ ] **Step 2: Confirm spec acceptance criteria**

Re-read `vault/specs/2026-05-10-backend-cli-only/spec.md`. Tick every `[x]` in the AC sections that's actually verified.

- [ ] **Step 3: Open PR via `/new-pr` skill**

Do NOT call `gh pr create` directly — invoke the project's `/new-pr` skill.

The PR title:

```
feat(backend): CLI-only backend management + read-only /backend page (#56)
```

PR body must include: link to spec 0072, list of 12 phases, BREAKING CHANGE footer for `ZENO_BACKEND` env removal, link to GitHub issue [#56](https://github.com/ribeirogab/zeno-agent/issues/56).

- [ ] **Step 4: Confirm PR opens cleanly + CI passes**

After PR is opened, wait for CI. If failures, fix on the same branch and push.

- [ ] **Step 5: Update spec status to `shipped` after merge** (post-merge follow-up)

```yaml
status: shipped
shipped: 2026-05-XX
```

In the spec frontmatter. Plus reflection note in `vault/learnings/` per CLAUDE.md.
