# Drop pnpm Host Prerequisite — Tasks

> **For agentic workers:** execute tasks in order. Each code-changing task is self-contained: write test → run (fail) → implement → run (pass) → commit. The full quality gate runs once at the end of Phase 4. Spec lives at [spec.md](./spec.md). Plan at [plan.md](./plan.md).

## Conventions

- **TDD:** every task that adds runtime behaviour starts with a failing test.
- **Commits:** Conventional Commits format. Subject under 72 chars. No `Co-Authored-By` lines (project rule 19).
- **CLI test runner:** `pnpm --filter @zeno/cli test -- <pattern>`.
- **Type checker:** `pnpm --filter @zeno/cli typecheck`.
- **No quality gate per task** — runs at end of Phase 4.

---

## Phase 1 — `upgradeSteps.bootstrapPnpm` (foundation)

### Task 1: Add `bootstrapPnpm` step + unit tests

**Files:**
- Modify: `apps/cli/src/lib/upgrade.ts`
- Modify: `apps/cli/tests/lib/upgrade.test.ts`

- [ ] **Step 1.1 — Write the failing tests**

Append to `apps/cli/tests/lib/upgrade.test.ts` (keep the existing `pickTarget` block intact):

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';

const homeRef = vi.hoisted(() => ({ value: '/__placeholder__' }));
const spawnSyncMock = vi.hoisted(() =>
  vi.fn(() => ({ status: 0, stdout: '', stderr: '', signal: null, output: [], pid: 0 })),
);

vi.mock('@/lib/paths.js', () => ({
  get ZENO_HOME() {
    return homeRef.value;
  },
}));
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, spawnSync: spawnSyncMock };
});

import { upgradeSteps } from '@/lib/upgrade.js';

describe('upgradeSteps.bootstrapPnpm', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'zeno-bp-'));
    homeRef.value = tmp;
    spawnSyncMock.mockClear();
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      signal: null,
      output: [],
      pid: 0,
    } as never);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('invokes corepack enable then corepack prepare pnpm@<version> --activate', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'zeno-agent', packageManager: 'pnpm@10.33.0' }),
    );
    upgradeSteps.bootstrapPnpm();
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
    expect(spawnSyncMock.mock.calls[0]?.[0]).toBe('corepack');
    expect(spawnSyncMock.mock.calls[0]?.[1]).toEqual(['enable']);
    expect(spawnSyncMock.mock.calls[1]?.[0]).toBe('corepack');
    expect(spawnSyncMock.mock.calls[1]?.[1]).toEqual([
      'prepare',
      'pnpm@10.33.0',
      '--activate',
    ]);
  });

  it('sets COREPACK_ENABLE_DOWNLOAD_PROMPT=0 in spawn env', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@10.33.0' }),
    );
    upgradeSteps.bootstrapPnpm();
    for (const call of spawnSyncMock.mock.calls) {
      const opts = call[2] as { env?: Record<string, string> } | undefined;
      expect(opts?.env?.COREPACK_ENABLE_DOWNLOAD_PROMPT).toBe('0');
    }
  });

  it('throws a specific message when package.json lacks packageManager', () => {
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'zeno-agent' }));
    expect(() => upgradeSteps.bootstrapPnpm()).toThrow(
      /package\.json missing "packageManager" field/,
    );
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('throws when corepack exits non-zero', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@10.33.0' }),
    );
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: '',
      stderr: '',
      signal: null,
      output: [],
      pid: 0,
    } as never);
    spawnSyncMock.mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'corepack: signature mismatch',
      signal: null,
      output: [],
      pid: 0,
    } as never);
    expect(() => upgradeSteps.bootstrapPnpm()).toThrow(/bootstrapPnpm failed/);
  });
});
```

- [ ] **Step 1.2 — Run tests to confirm failure**

```bash
pnpm --filter @zeno/cli test -- tests/lib/upgrade.test.ts
```

Expected: four new tests in the `bootstrapPnpm` describe block fail because `upgradeSteps.bootstrapPnpm` does not yet exist (`TypeError: upgradeSteps.bootstrapPnpm is not a function`).

- [ ] **Step 1.3 — Implement `bootstrapPnpm`**

Edit `apps/cli/src/lib/upgrade.ts`. Add a helper above `upgradeSteps`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function parsePackageManagerVersion(home: string): string {
  const pkgPath = join(home, 'package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const parsed = JSON.parse(raw) as { packageManager?: string };
  const value = parsed.packageManager;
  if (!value || !value.startsWith('pnpm@')) {
    throw new Error('package.json missing "packageManager" field (corepack bootstrap requires it)');
  }
  return value.slice('pnpm@'.length);
}
```

Add the `bootstrapPnpm` member to `upgradeSteps`, immediately after `writeMeta` and before `installDeps`:

```ts
  bootstrapPnpm(): void {
    const version = parsePackageManagerVersion(ZENO_HOME);
    const env = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };
    const enable = spawnSync('corepack', ['enable'], { stdio: 'inherit', cwd: ZENO_HOME, env });
    if (enable.status !== 0) {
      throw new Error(`bootstrapPnpm failed: corepack enable exited ${enable.status}`);
    }
    const prepare = spawnSync(
      'corepack',
      ['prepare', `pnpm@${version}`, '--activate'],
      { stdio: 'inherit', cwd: ZENO_HOME, env },
    );
    if (prepare.status !== 0) {
      throw new Error(`bootstrapPnpm failed: corepack prepare exited ${prepare.status}`);
    }
  },
```

Note: the existing `run(cmd, args)` helper at `apps/cli/src/lib/upgrade.ts:114` does not accept an `env` override, which is why `bootstrapPnpm` calls `spawnSync` directly.

- [ ] **Step 1.4 — Run tests to confirm pass**

```bash
pnpm --filter @zeno/cli test -- tests/lib/upgrade.test.ts
```

Expected: all tests in the file pass, including the four new `bootstrapPnpm` tests.

- [ ] **Step 1.5 — Run typecheck**

```bash
pnpm --filter @zeno/cli typecheck
```

Expected: zero errors.

- [ ] **Step 1.6 — Commit**

```bash
git add apps/cli/src/lib/upgrade.ts apps/cli/tests/lib/upgrade.test.ts
git commit -m "feat(cli): add upgradeSteps.bootstrapPnpm via corepack"
```

---

## Phase 2 — Wire `bootstrapPnpm` into `commands/upgrade.ts`

### Task 2: Update `--dry-run` printout to list eight steps

**Files:**
- Modify: `apps/cli/src/commands/upgrade.ts`
- Modify: `apps/cli/tests/commands/upgrade-pipeline.test.ts`

- [ ] **Step 2.1 — Write the failing test extension**

In `apps/cli/tests/commands/upgrade-pipeline.test.ts`, locate the existing test `--dry-run prints all 7 steps without executing` (currently at line 118). Rename it and extend its assertions:

```ts
  it('--dry-run prints all 8 steps without executing', async () => {
    queriesMock.getVersion.mockReturnValue('v2026.5.9');
    await upgrade.run?.({
      args: { branch: 'feat/foo', yes: true, dryRun: true },
      cmd: upgrade,
      rawArgs: [],
      data: undefined,
    } as never);
    const out = stdoutChunks.join('\n');
    expect(out).toMatch(/target.*branch:feat\/foo/);
    for (const step of [
      'fetchTags',
      'checkoutRef',
      'setVersion',
      'writeMeta',
      'bootstrapPnpm',
      'installDeps',
      'buildCli',
      'buildImage',
    ]) {
      expect(out).toContain(step);
    }
    expect(stepsMock.fetchTags).not.toHaveBeenCalled();
    expect(stepsMock.buildImage).not.toHaveBeenCalled();
  });
```

Also add `bootstrapPnpm: vi.fn()` to the hoisted `stepsMock` declaration (line 24) and to the `upgradeSteps` mock object (line 45):

```ts
const stepsMock = vi.hoisted(() => ({
  fetchTags: vi.fn(),
  checkoutRef: vi.fn(),
  setVersion: vi.fn(),
  writeMeta: vi.fn(),
  bootstrapPnpm: vi.fn(),
  installDeps: vi.fn(),
  buildCli: vi.fn(),
  buildImage: vi.fn(),
  shortSha: vi.fn(() => 'aaa1111'),
  listReleases: vi.fn(async () => [
    { tag: 'v2026.5.10', prerelease: false, publishedAt: '2026-05-09' },
    { tag: 'v2026.5.9', prerelease: false, publishedAt: '2026-05-08' },
  ]),
}));
```

```ts
    upgradeSteps: {
      fetchTags: stepsMock.fetchTags,
      checkoutRef: stepsMock.checkoutRef,
      setVersion: stepsMock.setVersion,
      writeMeta: stepsMock.writeMeta,
      bootstrapPnpm: stepsMock.bootstrapPnpm,
      installDeps: stepsMock.installDeps,
      buildCli: stepsMock.buildCli,
      buildImage: stepsMock.buildImage,
    },
```

Also add `stepsMock.bootstrapPnpm.mockReset();` to the `beforeEach` block (around line 79).

- [ ] **Step 2.2 — Run test to confirm failure**

```bash
pnpm --filter @zeno/cli test -- tests/commands/upgrade-pipeline.test.ts
```

Expected: the renamed dry-run test fails because the printout does not yet contain `bootstrapPnpm`.

- [ ] **Step 2.3 — Implement the dry-run printout change**

Edit `apps/cli/src/commands/upgrade.ts` lines 169–176. Replace:

```ts
      console.log('    1. fetchTags');
      console.log(`    2. checkoutRef(${checkoutValue}, ${resolved.kind})`);
      console.log('    3. setVersion');
      console.log('    4. writeMeta');
      console.log('    5. installDeps (pnpm install --frozen-lockfile)');
      console.log('    6. buildCli (pnpm build --filter @zeno/cli)');
      console.log('    7. buildImage (docker build -t zeno-agent:dev)');
```

With:

```ts
      console.log('    1. fetchTags');
      console.log(`    2. checkoutRef(${checkoutValue}, ${resolved.kind})`);
      console.log('    3. setVersion');
      console.log('    4. writeMeta');
      console.log('    5. bootstrapPnpm (corepack prepare pnpm@<version> --activate)');
      console.log('    6. installDeps (pnpm install --frozen-lockfile)');
      console.log('    7. buildCli (pnpm build --filter @zeno/cli)');
      console.log('    8. buildImage (docker build -t zeno-agent:dev)');
```

- [ ] **Step 2.4 — Run test to confirm pass**

```bash
pnpm --filter @zeno/cli test -- tests/commands/upgrade-pipeline.test.ts
```

Expected: the dry-run test passes. (Other tests in the file may still fail — Task 3 fixes those.)

- [ ] **Step 2.5 — Commit**

```bash
git add apps/cli/src/commands/upgrade.ts apps/cli/tests/commands/upgrade-pipeline.test.ts
git commit -m "feat(cli): show bootstrapPnpm in zeno upgrade --dry-run"
```

### Task 3: Call `bootstrapPnpm` in the live pipeline

**Files:**
- Modify: `apps/cli/src/commands/upgrade.ts`
- Modify: `apps/cli/tests/commands/upgrade-pipeline.test.ts`

- [ ] **Step 3.1 — Write the failing test extension**

In `apps/cli/tests/commands/upgrade-pipeline.test.ts`, find the existing test `writes .installed-from after successful upgrade` (around line 206) and add an assertion that `bootstrapPnpm` was called once after `writeMeta` and before `installDeps`. Append inside that test, after the existing `expect(stepsMock.buildImage).toHaveBeenCalled();`:

```ts
    expect(stepsMock.bootstrapPnpm).toHaveBeenCalledTimes(1);
    const writeMetaOrder = stepsMock.writeMeta.mock.invocationCallOrder[0] ?? Infinity;
    const bootstrapOrder = stepsMock.bootstrapPnpm.mock.invocationCallOrder[0] ?? -Infinity;
    const installDepsOrder = stepsMock.installDeps.mock.invocationCallOrder[0] ?? -Infinity;
    expect(bootstrapOrder).toBeGreaterThan(writeMetaOrder);
    expect(bootstrapOrder).toBeLessThan(installDepsOrder);
```

- [ ] **Step 3.2 — Run test to confirm failure**

```bash
pnpm --filter @zeno/cli test -- tests/commands/upgrade-pipeline.test.ts
```

Expected: `bootstrapPnpm` mock is never called (assertion fails).

- [ ] **Step 3.3 — Implement the pipeline insertion**

Open `apps/cli/src/commands/upgrade.ts`. Find the block that wraps `installDeps` with a spinner — look for a line like:

```ts
      await spin('installing dependencies', async () => {
        upgradeSteps.installDeps();
      });
```

Insert immediately above it:

```ts
      await spin('bootstrapping pnpm via corepack', async () => {
        upgradeSteps.bootstrapPnpm();
      });
```

- [ ] **Step 3.4 — Run tests to confirm pass**

```bash
pnpm --filter @zeno/cli test -- tests/commands/upgrade-pipeline.test.ts
```

Expected: every test in the file passes.

- [ ] **Step 3.5 — Run typecheck**

```bash
pnpm --filter @zeno/cli typecheck
```

Expected: zero errors.

- [ ] **Step 3.6 — Commit**

```bash
git add apps/cli/src/commands/upgrade.ts apps/cli/tests/commands/upgrade-pipeline.test.ts
git commit -m "feat(cli): bootstrap pnpm via corepack in zeno upgrade pipeline"
```

---

## Phase 3 — `install.sh` corepack bootstrap

### Task 4: Replace `need pnpm` with corepack bootstrap in `install.sh`

**Files:**
- Modify: `install.sh`
- Modify: `apps/cli/tests/commands/install-sh.test.ts`

- [ ] **Step 4.1 — Write the failing test extension**

Append to `apps/cli/tests/commands/install-sh.test.ts`:

```ts
import { readFileSync } from 'node:fs';

describe('install.sh corepack bootstrap', () => {
  const source = readFileSync(SH, 'utf8');

  it('does not require pnpm on the host', () => {
    expect(source).not.toMatch(/^need pnpm /m);
  });

  it('enables corepack before invoking pnpm', () => {
    expect(source).toMatch(/corepack enable/);
    const enableIdx = source.indexOf('corepack enable');
    const pnpmInstallIdx = source.indexOf('pnpm install');
    expect(enableIdx).toBeGreaterThan(-1);
    expect(pnpmInstallIdx).toBeGreaterThan(enableIdx);
  });

  it('prepares the pnpm version parsed from package.json', () => {
    expect(source).toMatch(/corepack prepare "?pnpm@/);
    expect(source).toMatch(/parse_pnpm_version\(\)/);
  });

  it('exports COREPACK_ENABLE_DOWNLOAD_PROMPT=0 before corepack calls', () => {
    const corepackIdx = source.indexOf('corepack enable');
    const envIdx = source.indexOf('COREPACK_ENABLE_DOWNLOAD_PROMPT=0');
    expect(envIdx).toBeGreaterThan(-1);
    expect(envIdx).toBeLessThan(corepackIdx);
  });
});
```

- [ ] **Step 4.2 — Run tests to confirm failure**

```bash
pnpm --filter @zeno/cli test -- tests/commands/install-sh.test.ts
```

Expected: the four new tests fail (no `corepack` in the script yet; `need pnpm` is still present).

- [ ] **Step 4.3 — Edit `install.sh`**

Three edits in `install.sh`:

**Edit A — remove `need pnpm` line.** Find at line 179:

```sh
need pnpm   'install pnpm 10: https://pnpm.io/installation'
```

Delete that line. The remaining `need` calls (`git`, `docker`, `node`, `curl`) stay.

**Edit B — add `parse_pnpm_version` helper and corepack invocation.** Find the block at lines 217–219:

```sh
cd "$ZENO_HOME"
pnpm install --frozen-lockfile
pnpm build --filter @zeno/cli
```

Replace with:

```sh
cd "$ZENO_HOME"

parse_pnpm_version() {
  grep '"packageManager"' package.json | sed 's/.*"pnpm@\([^"]*\)".*/\1/'
}

PNPM_VERSION="$(parse_pnpm_version)"
if [ -z "$PNPM_VERSION" ]; then
  fail 'package.json missing "packageManager" field (corepack bootstrap requires it)'
fi

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate

pnpm install --frozen-lockfile
pnpm build --filter @zeno/cli
```

**Edit C — update the file header comment.** Lines 14–28 currently include:

```sh
#   - Verifies prerequisites (git, docker, node 24+, pnpm 10+, curl) and prints
#     an install URL when one is missing.
```

Replace with:

```sh
#   - Verifies prerequisites (git, docker, node 24+, curl) and prints
#     an install URL when one is missing. pnpm is bootstrapped via corepack
#     from the cloned repo's package.json (no host pnpm needed).
```

- [ ] **Step 4.4 — Run tests to confirm pass**

```bash
pnpm --filter @zeno/cli test -- tests/commands/install-sh.test.ts
```

Expected: all tests in the file pass, including the four new ones. The pre-existing flag-parser tests must still pass (the new code path runs only after `--dry-parse` exits, so it does not interfere).

- [ ] **Step 4.5 — Commit**

```bash
git add install.sh apps/cli/tests/commands/install-sh.test.ts
git commit -m "feat(install): bootstrap pnpm via corepack, drop host pnpm prereq"
```

---

## Phase 4 — Docs, ROADMAP, quality gate

### Task 5: Drop pnpm from `install.mdx` prerequisites

**Files:**
- Modify: `apps/docs/content/docs/install.mdx`

- [ ] **Step 5.1 — Edit `install.mdx`**

Open `apps/docs/content/docs/install.mdx` and locate the **Prerequisites** list (around line 12). Currently:

```mdx
## Prerequisites

- `git`
- `docker` (Engine running; the CLI talks to the Docker socket directly)
- Node.js 24 LTS
- pnpm 10
- macOS or Linux. WSL2 on Windows works; native Windows does not.
```

Remove the `- pnpm 10` line so the section becomes:

```mdx
## Prerequisites

- `git`
- `docker` (Engine running; the CLI talks to the Docker socket directly)
- Node.js 24 LTS
- macOS or Linux. WSL2 on Windows works; native Windows does not.
```

- [ ] **Step 5.2 — Commit**

```bash
git add apps/docs/content/docs/install.mdx
git commit -m "docs(install): drop pnpm from operator prerequisites"
```

### Task 6: Append to `ROADMAP.md` Recently shipped

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 6.1 — Edit `ROADMAP.md`**

Open `ROADMAP.md` and find the **Recently shipped** section (line 26). Add a new entry at the top of the list (immediately below the heading), preserving chronological order:

```markdown
- [x] [#52](https://github.com/ribeirogab/zeno-agent/issues/52) — feat(install): drop pnpm host prereq via corepack bootstrap
```

(The PR-link suffix is added by the merge automation in the release flow; leaving it bare here matches the existing convention for items committed mid-PR.)

- [ ] **Step 6.2 — Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): mark #52 shipped"
```

### Task 7: Run the full quality gate

- [ ] **Step 7.1 — Run quality gate**

```bash
pnpm run quality-gate
```

Expected: green across lint, typecheck, and tests for every workspace.

- [ ] **Step 7.2 — If anything fails, fix and recommit**

For each failure, identify the file, edit, re-run `pnpm run quality-gate`, and commit the fix with `fix(<scope>): <message>` per Conventional Commits. Do **not** combine the fix into one of the earlier task commits.

### Task 8: Open the pull request

- [ ] **Step 8.1 — Push the branch**

```bash
git push -u origin feat/drop-pnpm-prereq
```

- [ ] **Step 8.2 — Open the PR via `/new-pr`**

Use the `/new-pr` skill (project rule — never run `gh pr create` directly). The PR title must be:

```
feat(install): drop pnpm host prereq via corepack bootstrap
```

The PR description must reference issue #52 with the `Closes #52` keyword so GitHub closes it on merge, and link to this spec at `.vault/specs/2026-05-12-drop-pnpm-prereq/spec.md`.
