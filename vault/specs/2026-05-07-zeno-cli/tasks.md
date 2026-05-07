---
feature: zeno-cli
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-05-07
---
# Zeno CLI — Tasks

**For this plan:** `[[plan]]`

> All commits in this branch follow Conventional Commits and use the `feat(cli):`, `chore(cli):`, `test(cli):`, `docs:`, or `ci:` scope as appropriate. Branch name: `feat/zeno-cli`. Open the PR via `/open-pr` per project rule.
>
> Per global rule 20: never run `git add`/`commit`/`push` without explicit user approval. Each commit step assumes the operator has approved committing for that batch. If unsure, pause and ask.

## Phase 0 — Discovery

### Task 0.1: Verify `citty` current API

- [ ] Step 1: query context7 for `citty` (Nuxt) docs.

  Run: query context7 with library ID `unjs/citty` and topic `defineCommand subCommands meta args`.

  Capture: the current export shape (`defineCommand`, `runMain`, `defineMain`?), the args type used for `--profile <name>` (likely `type: 'string'` with a default), the recommended pattern for nested `subCommands`, and the way to register a positional varargs argument (used by `zeno docker <args...>`). If the API has shifted from the assumptions in `plan.md`, write a learning at `vault/learnings/citty-api-2026-05.md` summarizing the divergence and update the plan before continuing.

- [ ] Step 2: pin `citty` to the latest stable major.

  Run: `npm view citty versions --json | jq -r '.[]' | tail -10` (or visit npmjs.com/package/citty).

  Record the pinned version (expected `^0.1.x` based on training data; verify).

### Task 0.2: Verify `tsup` current config + shebang preservation

- [ ] Step 1: query context7 for `tsup` configuration, focusing on `banner`, `format`, `target`, `external`, and shebang preservation.

  Capture: whether `banner` is `{ js: '#!/usr/bin/env node' }` or a string, whether `tsup` preserves an existing `#!/usr/bin/env node` from the source automatically (some versions do, some don't), and the recommended way to mark `*.json` files as external.

- [ ] Step 2: pin `tsup` to the latest stable major. Record the version.

### Task 0.3: Verify `pnpm version` works on a private monorepo root

- [ ] Step 1: clone the repo to a throwaway dir and run a dry version bump.

  ```sh
  cd /tmp && git clone https://github.com/ribeirogab/zeno-agent.git zeno-agent-test
  cd zeno-agent-test
  pnpm version 2026.5.7 --no-git-tag-version
  cat package.json | grep '"version"'
  ```

  Expected: `"version": "2026.5.7"` in root `package.json`. No mutation of any other `package.json`.

- [ ] Step 2: clean up.

  ```sh
  cd /tmp && rm -rf zeno-agent-test
  ```

  If the bump failed: halt, do not proceed to Phase 8. Reopen the spec and document the failure mode. Otherwise, the workflow change in Phase 8 is unblocked.

### Task 0.4: Verify branch protection on `main` permits the release workflow's bot push

- [ ] Step 1: inspect branch protection.

  ```sh
  gh api repos/ribeirogab/zeno-agent/branches/main/protection 2>/dev/null | jq '.'
  ```

  If the response is `404` or shows `enforce_admins: false` and no required reviewers, the workflow's bot push will succeed unconditionally; proceed.

  If the response shows required reviews or required status checks that would block a bot commit, decision is required before Phase 8: (a) add a bypass for `github-actions[bot]`, or (b) switch the workflow to use a GitHub App token / deploy key. Capture the chosen path in `vault/learnings/release-workflow-bot-push.md`.

## Phase 1 — Workspace scaffolding

### Task 1.1: Add `apps/cli/package.json`

**Files:**
- Create: `apps/cli/package.json`

- [ ] Step 1: create the manifest.

  ```json
  {
    "name": "@zeno/cli",
    "version": "0.0.0",
    "private": true,
    "type": "module",
    "bin": {
      "zeno": "./dist/index.js"
    },
    "scripts": {
      "build": "tsup",
      "dev": "tsup --watch",
      "lint": "biome check .",
      "typecheck": "tsc --noEmit",
      "test": "vitest run"
    },
    "dependencies": {
      "citty": "<pinned-version-from-task-0.1>"
    },
    "devDependencies": {
      "@types/node": "^24.0.0",
      "tsup": "<pinned-version-from-task-0.2>",
      "typescript": "^6.0.2",
      "vitest": "^4.1.4"
    }
  }
  ```

  Substitute the pinned versions from Task 0.1 / 0.2.

- [ ] Step 2: install at the workspace root.

  ```sh
  pnpm install
  ```

  Expected: pnpm picks up `apps/cli` and writes its node_modules; `pnpm-lock.yaml` updates.

### Task 1.2: Add `apps/cli/tsconfig.json`

**Files:**
- Create: `apps/cli/tsconfig.json`

- [ ] Step 1: create the config.

  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "outDir": "./dist",
      "rootDir": "./src",
      "resolveJsonModule": true,
      "types": ["node"]
    },
    "include": ["src/**/*"],
    "exclude": ["dist", "node_modules"]
  }
  ```

- [ ] Step 2: verify typecheck passes on an empty source.

  ```sh
  echo 'export {};' > apps/cli/src/index.ts
  pnpm --filter @zeno/cli typecheck
  ```

  Expected: exit 0.

### Task 1.3: Add `apps/cli/tsup.config.ts`

**Files:**
- Create: `apps/cli/tsup.config.ts`

- [ ] Step 1: create the config.

  ```ts
  import { defineConfig } from 'tsup';

  export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node24',
    outDir: 'dist',
    clean: true,
    splitting: false,
    sourcemap: false,
    dts: false,
    banner: { js: '#!/usr/bin/env node' },
    external: [],
    minify: false,
  });
  ```

  Notes:
  - `external: []` keeps `citty` bundled. The runtime dep on `citty` exists for `pnpm install` to resolve types during dev, but the production bundle is self-contained.
  - If Task 0.2 found that `tsup` requires `noExternal` to bundle deps, swap accordingly.

- [ ] Step 2: build the empty entry to confirm wiring.

  ```sh
  pnpm --filter @zeno/cli build
  head -1 apps/cli/dist/index.js
  ```

  Expected: first line is `#!/usr/bin/env node`. File is executable as a Node script.

### Task 1.4: Add `apps/cli/vitest.config.ts`

**Files:**
- Create: `apps/cli/vitest.config.ts`

- [ ] Step 1: create the config.

  ```ts
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      include: ['src/**/__tests__/**/*.test.ts'],
      environment: 'node',
    },
  });
  ```

- [ ] Step 2: confirm vitest finds zero tests gracefully.

  ```sh
  pnpm --filter @zeno/cli test
  ```

  Expected: vitest reports "No test files found" and exits 0 (or 1 depending on default; if 1, that is fine for now — Phase 2 adds tests).

### Task 1.5: Verify Turborepo recognises the workspace

- [ ] Step 1: read `turbo.json`.

  ```sh
  cat turbo.json
  ```

  If the pipeline declares `build`, `lint`, `typecheck`, `test` globally, `@zeno/cli` is auto-included. No edit needed.

  If the pipeline scopes tasks per workspace and `apps/cli` is not yet listed, add it. (Most common case in this repo: no edit needed.)

- [ ] Step 2: smoke run.

  ```sh
  pnpm run quality-gate
  ```

  Expected: `@zeno/cli` typecheck/lint/test all pass (test may be 0-tests; typecheck on an empty file passes; lint may flag an empty file — if so, add a placeholder export comment to `apps/cli/src/index.ts`).

### Task 1.6: Commit Phase 1

- [ ] Step 1: stage and commit.

  ```sh
  git checkout -b feat/zeno-cli
  git add apps/cli pnpm-lock.yaml
  git commit -m "feat(cli): scaffold apps/cli workspace (citty + tsup)"
  ```

## Phase 2 — Shared lib + tests

### Task 2.1: `lib/zeno-home.ts`

**Files:**
- Create: `apps/cli/src/lib/zeno-home.ts`
- Create: `apps/cli/src/lib/__tests__/zeno-home.test.ts`

- [ ] Step 1: write the failing test.

  ```ts
  // apps/cli/src/lib/__tests__/zeno-home.test.ts
  import { afterEach, beforeEach, describe, expect, it } from 'vitest';
  import { resolveZenoHome } from '../zeno-home.js';

  describe('resolveZenoHome', () => {
    let originalEnv: string | undefined;
    beforeEach(() => {
      originalEnv = process.env.ZENO_HOME;
      delete process.env.ZENO_HOME;
    });
    afterEach(() => {
      if (originalEnv === undefined) delete process.env.ZENO_HOME;
      else process.env.ZENO_HOME = originalEnv;
    });

    it('returns process.env.ZENO_HOME when set', () => {
      process.env.ZENO_HOME = '/tmp/custom-zeno';
      expect(resolveZenoHome()).toBe('/tmp/custom-zeno');
    });

    it('falls back to ~/zeno-agent when env unset', () => {
      const home = resolveZenoHome();
      expect(home).toMatch(/zeno-agent$/);
      expect(home.startsWith(process.env.HOME ?? '')).toBe(true);
    });
  });
  ```

- [ ] Step 2: run — expect failure (`Cannot find module '../zeno-home.js'`).

  ```sh
  pnpm --filter @zeno/cli test
  ```

- [ ] Step 3: implement.

  ```ts
  // apps/cli/src/lib/zeno-home.ts
  import { homedir } from 'node:os';
  import { join } from 'node:path';

  export function resolveZenoHome(): string {
    return process.env.ZENO_HOME ?? join(homedir(), 'zeno-agent');
  }
  ```

- [ ] Step 4: run — expect pass.

  ```sh
  pnpm --filter @zeno/cli test
  ```

- [ ] Step 5: commit.

  ```sh
  git add apps/cli/src/lib/zeno-home.ts apps/cli/src/lib/__tests__/zeno-home.test.ts
  git commit -m "feat(cli): add resolveZenoHome lib"
  ```

### Task 2.2: `lib/state.ts`

**Files:**
- Create: `apps/cli/src/lib/state.ts`
- Create: `apps/cli/src/lib/__tests__/state.test.ts`

- [ ] Step 1: write failing tests.

  ```ts
  // apps/cli/src/lib/__tests__/state.test.ts
  import { mkdtempSync, rmSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { afterEach, beforeEach, describe, expect, it } from 'vitest';
  import { readState, writeState } from '../state.js';

  describe('state', () => {
    let home: string;
    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), 'zeno-state-'));
    });
    afterEach(() => {
      rmSync(home, { recursive: true, force: true });
    });

    it('readState returns empty object when state file missing', () => {
      expect(readState(home)).toEqual({});
    });

    it('writeState then readState round-trips', () => {
      writeState(home, { profile: 'fn' });
      expect(readState(home)).toEqual({ profile: 'fn' });
    });

    it('writeState creates apps/cli directory if missing', () => {
      writeState(home, { profile: 'default' });
      expect(readState(home).profile).toBe('default');
    });
  });
  ```

- [ ] Step 2: run — expect failure.

  ```sh
  pnpm --filter @zeno/cli test state
  ```

- [ ] Step 3: implement.

  ```ts
  // apps/cli/src/lib/state.ts
  import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
  import { dirname, join } from 'node:path';

  export interface CliState {
    profile?: string;
  }

  function statePath(home: string): string {
    return join(home, 'apps', 'cli', '.state.json');
  }

  export function readState(home: string): CliState {
    const path = statePath(home);
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as CliState;
    } catch {
      return {};
    }
  }

  export function writeState(home: string, state: CliState): void {
    const path = statePath(home);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }
  ```

- [ ] Step 4: run — expect pass.

- [ ] Step 5: commit.

  ```sh
  git add apps/cli/src/lib/state.ts apps/cli/src/lib/__tests__/state.test.ts
  git commit -m "feat(cli): add state read/write (.state.json)"
  ```

### Task 2.3: `lib/profile.ts`

**Files:**
- Create: `apps/cli/src/lib/profile.ts`
- Create: `apps/cli/src/lib/__tests__/profile.test.ts`

- [ ] Step 1: write failing tests.

  ```ts
  // apps/cli/src/lib/__tests__/profile.test.ts
  import { describe, expect, it } from 'vitest';
  import { resolveProfile } from '../profile.js';

  describe('resolveProfile', () => {
    it('flag wins over env, state, default', () => {
      expect(resolveProfile({ flag: 'flag-x', env: 'env-y', state: { profile: 'state-z' } }))
        .toEqual({ name: 'flag-x', source: 'flag' });
    });

    it('env wins over state, default when no flag', () => {
      expect(resolveProfile({ flag: undefined, env: 'env-y', state: { profile: 'state-z' } }))
        .toEqual({ name: 'env-y', source: 'env' });
    });

    it('state wins over default when no flag/env', () => {
      expect(resolveProfile({ flag: undefined, env: undefined, state: { profile: 'state-z' } }))
        .toEqual({ name: 'state-z', source: 'state' });
    });

    it('default when nothing set', () => {
      expect(resolveProfile({ flag: undefined, env: undefined, state: {} }))
        .toEqual({ name: 'default', source: 'default' });
    });

    it('empty string flag is treated as unset', () => {
      expect(resolveProfile({ flag: '', env: 'env-y', state: {} }))
        .toEqual({ name: 'env-y', source: 'env' });
    });
  });
  ```

- [ ] Step 2: run — expect failure.

- [ ] Step 3: implement.

  ```ts
  // apps/cli/src/lib/profile.ts
  import type { CliState } from './state.js';

  export type ProfileSource = 'flag' | 'env' | 'state' | 'default';

  export interface ResolvedProfile {
    name: string;
    source: ProfileSource;
  }

  export interface ResolveProfileInput {
    flag?: string;
    env?: string;
    state: CliState;
  }

  export function resolveProfile(input: ResolveProfileInput): ResolvedProfile {
    if (input.flag) return { name: input.flag, source: 'flag' };
    if (input.env) return { name: input.env, source: 'env' };
    if (input.state.profile) return { name: input.state.profile, source: 'state' };
    return { name: 'default', source: 'default' };
  }
  ```

- [ ] Step 4: run — expect pass.

- [ ] Step 5: commit.

  ```sh
  git add apps/cli/src/lib/profile.ts apps/cli/src/lib/__tests__/profile.test.ts
  git commit -m "feat(cli): add profile resolution chain"
  ```

### Task 2.4: `lib/compose.ts`

**Files:**
- Create: `apps/cli/src/lib/compose.ts`
- Create: `apps/cli/src/lib/__tests__/compose.test.ts`

- [ ] Step 1: write failing tests for the pure helpers.

  ```ts
  // apps/cli/src/lib/__tests__/compose.test.ts
  import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { afterEach, beforeEach, describe, expect, it } from 'vitest';
  import { composeArgs, composeFileExists } from '../compose.js';

  describe('composeArgs', () => {
    it('returns the standard -f / --project-directory pair', () => {
      expect(composeArgs('/home/user/zeno-agent', 'default')).toEqual([
        '-f', 'infra/docker-compose.default.yml',
        '--project-directory', '/home/user/zeno-agent',
      ]);
    });
  });

  describe('composeFileExists', () => {
    let home: string;
    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), 'zeno-compose-'));
      mkdirSync(join(home, 'infra'), { recursive: true });
      writeFileSync(join(home, 'infra', 'docker-compose.default.yml'), 'services: {}\n');
    });
    afterEach(() => rmSync(home, { recursive: true, force: true }));

    it('true when file exists', () => {
      expect(composeFileExists(home, 'default')).toBe(true);
    });
    it('false when file missing', () => {
      expect(composeFileExists(home, 'fn')).toBe(false);
    });
  });
  ```

- [ ] Step 2: run — expect failure.

- [ ] Step 3: implement.

  ```ts
  // apps/cli/src/lib/compose.ts
  import { spawn } from 'node:child_process';
  import { existsSync } from 'node:fs';
  import { join } from 'node:path';

  export function composeArgs(home: string, profile: string): string[] {
    return [
      '-f', `infra/docker-compose.${profile}.yml`,
      '--project-directory', home,
    ];
  }

  export function composeFileExists(home: string, profile: string): boolean {
    return existsSync(join(home, 'infra', `docker-compose.${profile}.yml`));
  }

  export function runCompose(
    home: string,
    profile: string,
    args: string[],
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        'docker',
        ['compose', ...composeArgs(home, profile), ...args],
        { stdio: 'inherit', cwd: home },
      );
      child.on('exit', (code, signal) => {
        if (code !== null) resolve(code);
        else if (signal !== null) resolve(128 + (signalNumber(signal) ?? 0));
        else resolve(1);
      });
      child.on('error', reject);
    });
  }

  function signalNumber(signal: NodeJS.Signals): number | undefined {
    const map: Record<string, number> = {
      SIGINT: 2, SIGTERM: 15, SIGKILL: 9, SIGHUP: 1, SIGQUIT: 3,
    };
    return map[signal];
  }
  ```

- [ ] Step 4: run — expect pass for `composeArgs` + `composeFileExists`. `runCompose` is integration-tested manually in Phase 10 (cannot unit-test child process spawning of a real `docker` binary cleanly in CI).

- [ ] Step 5: commit.

  ```sh
  git add apps/cli/src/lib/compose.ts apps/cli/src/lib/__tests__/compose.test.ts
  git commit -m "feat(cli): add compose helper (args + spawn + file probe)"
  ```

### Task 2.5: `lib/profile-list.ts`

**Files:**
- Create: `apps/cli/src/lib/profile-list.ts`
- Create: `apps/cli/src/lib/__tests__/profile-list.test.ts`

- [ ] Step 1: write failing tests.

  ```ts
  // apps/cli/src/lib/__tests__/profile-list.test.ts
  import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { afterEach, beforeEach, describe, expect, it } from 'vitest';
  import { listProfiles } from '../profile-list.js';

  describe('listProfiles', () => {
    let home: string;
    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), 'zeno-profilelist-'));
      mkdirSync(join(home, 'infra'), { recursive: true });
    });
    afterEach(() => rmSync(home, { recursive: true, force: true }));

    it('returns empty list when no compose files', () => {
      expect(listProfiles(home)).toEqual([]);
    });

    it('extracts names from docker-compose.<name>.yml', () => {
      writeFileSync(join(home, 'infra', 'docker-compose.default.yml'), '');
      writeFileSync(join(home, 'infra', 'docker-compose.fn.yml'), '');
      expect(listProfiles(home).sort()).toEqual(['default', 'fn']);
    });

    it('ignores non-matching files', () => {
      writeFileSync(join(home, 'infra', 'docker-compose.default.yml'), '');
      writeFileSync(join(home, 'infra', 'Dockerfile'), '');
      writeFileSync(join(home, 'infra', 'docker-compose.yml'), '');
      expect(listProfiles(home)).toEqual(['default']);
    });
  });
  ```

- [ ] Step 2: run — expect failure.

- [ ] Step 3: implement.

  ```ts
  // apps/cli/src/lib/profile-list.ts
  import { existsSync, readdirSync } from 'node:fs';
  import { join } from 'node:path';

  const COMPOSE_RE = /^docker-compose\.([^.]+)\.yml$/;

  export function listProfiles(home: string): string[] {
    const dir = join(home, 'infra');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .map((name) => COMPOSE_RE.exec(name))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m[1])
      .sort();
  }
  ```

- [ ] Step 4: run — expect pass.

- [ ] Step 5: commit.

  ```sh
  git add apps/cli/src/lib/profile-list.ts apps/cli/src/lib/__tests__/profile-list.test.ts
  git commit -m "feat(cli): add listProfiles (glob compose files)"
  ```

### Task 2.6: `lib/version.ts`

**Files:**
- Create: `apps/cli/src/lib/version.ts`
- Create: `apps/cli/src/lib/__tests__/version.test.ts`

- [ ] Step 1: write failing tests.

  ```ts
  // apps/cli/src/lib/__tests__/version.test.ts
  import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { afterEach, beforeEach, describe, expect, it } from 'vitest';
  import { readVersion } from '../version.js';

  describe('readVersion', () => {
    let home: string;
    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), 'zeno-version-'));
    });
    afterEach(() => rmSync(home, { recursive: true, force: true }));

    it('reads version from $home/package.json', () => {
      writeFileSync(join(home, 'package.json'), JSON.stringify({ version: '2026.5.7' }));
      expect(readVersion(home)).toBe('2026.5.7');
    });

    it('throws when package.json missing', () => {
      expect(() => readVersion(home)).toThrow(/package\.json/);
    });
  });
  ```

- [ ] Step 2: run — expect failure.

- [ ] Step 3: implement.

  ```ts
  // apps/cli/src/lib/version.ts
  import { readFileSync } from 'node:fs';
  import { join } from 'node:path';

  export function readVersion(home: string): string {
    const path = join(home, 'package.json');
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      throw new Error(`zeno: cannot read ${path} (zeno-agent install corrupted; re-run install.sh)`);
    }
    const pkg = JSON.parse(raw) as { version?: string };
    if (!pkg.version) throw new Error(`zeno: ${path} has no "version" field`);
    return pkg.version;
  }
  ```

- [ ] Step 4: run — expect pass.

- [ ] Step 5: commit.

  ```sh
  git add apps/cli/src/lib/version.ts apps/cli/src/lib/__tests__/version.test.ts
  git commit -m "feat(cli): add readVersion (root package.json)"
  ```

## Phase 3 — Container lifecycle commands

### Task 3.1: shared command context helper

**Files:**
- Create: `apps/cli/src/lib/context.ts`

- [ ] Step 1: implement (no test — pure composition of already-tested helpers).

  ```ts
  // apps/cli/src/lib/context.ts
  import { resolveZenoHome } from './zeno-home.js';
  import { readState } from './state.js';
  import { resolveProfile, type ResolvedProfile } from './profile.js';
  import { composeFileExists } from './compose.js';

  export interface CliContext {
    home: string;
    profile: ResolvedProfile;
  }

  export function buildContext(opts: { profileFlag?: string }): CliContext {
    const home = resolveZenoHome();
    const state = readState(home);
    const profile = resolveProfile({
      flag: opts.profileFlag,
      env: process.env.ZENO_PROFILE,
      state,
    });
    return { home, profile };
  }

  export function ensureProfileExists(ctx: CliContext): void {
    if (!composeFileExists(ctx.home, ctx.profile.name)) {
      const file = `infra/docker-compose.${ctx.profile.name}.yml`;
      console.error(`error: profile '${ctx.profile.name}' not found`);
      console.error(`       expected: ${file}`);
      console.error(`       run: zeno profile list`);
      process.exit(1);
    }
  }
  ```

- [ ] Step 2: commit.

  ```sh
  git add apps/cli/src/lib/context.ts
  git commit -m "feat(cli): add CLI context builder + profile guard"
  ```

### Task 3.2: `start`, `stop`, `restart`, `build` commands

**Files:**
- Create: `apps/cli/src/commands/start.ts`
- Create: `apps/cli/src/commands/stop.ts`
- Create: `apps/cli/src/commands/restart.ts`
- Create: `apps/cli/src/commands/build.ts`

- [ ] Step 1: implement `start`.

  ```ts
  // apps/cli/src/commands/start.ts
  import { defineCommand } from 'citty';
  import { runCompose } from '../lib/compose.js';
  import { buildContext, ensureProfileExists } from '../lib/context.js';

  export default defineCommand({
    meta: { name: 'start', description: 'start agent (compose up -d)' },
    args: {
      profile: { type: 'string', description: 'override resolved profile' },
    },
    async run({ args }) {
      const ctx = buildContext({ profileFlag: args.profile });
      ensureProfileExists(ctx);
      const code = await runCompose(ctx.home, ctx.profile.name, ['up', '-d']);
      process.exit(code);
    },
  });
  ```

- [ ] Step 2: implement `stop`.

  ```ts
  // apps/cli/src/commands/stop.ts
  import { defineCommand } from 'citty';
  import { runCompose } from '../lib/compose.js';
  import { buildContext, ensureProfileExists } from '../lib/context.js';

  export default defineCommand({
    meta: { name: 'stop', description: 'stop agent (compose down)' },
    args: {
      profile: { type: 'string', description: 'override resolved profile' },
    },
    async run({ args }) {
      const ctx = buildContext({ profileFlag: args.profile });
      ensureProfileExists(ctx);
      const code = await runCompose(ctx.home, ctx.profile.name, ['down']);
      process.exit(code);
    },
  });
  ```

- [ ] Step 3: implement `restart`.

  ```ts
  // apps/cli/src/commands/restart.ts
  import { defineCommand } from 'citty';
  import { runCompose } from '../lib/compose.js';
  import { buildContext, ensureProfileExists } from '../lib/context.js';

  export default defineCommand({
    meta: { name: 'restart', description: 'stop + start' },
    args: {
      profile: { type: 'string', description: 'override resolved profile' },
    },
    async run({ args }) {
      const ctx = buildContext({ profileFlag: args.profile });
      ensureProfileExists(ctx);
      const stopCode = await runCompose(ctx.home, ctx.profile.name, ['down']);
      if (stopCode !== 0) process.exit(stopCode);
      const startCode = await runCompose(ctx.home, ctx.profile.name, ['up', '-d']);
      process.exit(startCode);
    },
  });
  ```

- [ ] Step 4: implement `build`.

  ```ts
  // apps/cli/src/commands/build.ts
  import { defineCommand } from 'citty';
  import { runCompose } from '../lib/compose.js';
  import { buildContext, ensureProfileExists } from '../lib/context.js';

  export default defineCommand({
    meta: { name: 'build', description: 'build container image' },
    args: {
      profile: { type: 'string', description: 'override resolved profile' },
      'no-cache': { type: 'boolean', description: 'rebuild without cache' },
    },
    async run({ args }) {
      const ctx = buildContext({ profileFlag: args.profile });
      ensureProfileExists(ctx);
      const composeArgs = ['build'];
      if (args['no-cache']) composeArgs.push('--no-cache');
      const code = await runCompose(ctx.home, ctx.profile.name, composeArgs);
      process.exit(code);
    },
  });
  ```

- [ ] Step 5: commit.

  ```sh
  git add apps/cli/src/commands/{start,stop,restart,build}.ts
  git commit -m "feat(cli): add start/stop/restart/build commands"
  ```

### Task 3.3: `status`, `shell`, `logs`, `docker` commands

**Files:**
- Create: `apps/cli/src/commands/status.ts`
- Create: `apps/cli/src/commands/shell.ts`
- Create: `apps/cli/src/commands/logs.ts`
- Create: `apps/cli/src/commands/docker.ts`

- [ ] Step 1: implement `status`.

  ```ts
  // apps/cli/src/commands/status.ts
  import { defineCommand } from 'citty';
  import { runCompose } from '../lib/compose.js';
  import { buildContext, ensureProfileExists } from '../lib/context.js';

  export default defineCommand({
    meta: { name: 'status', description: 'container state' },
    args: {
      profile: { type: 'string', description: 'override resolved profile' },
    },
    async run({ args }) {
      const ctx = buildContext({ profileFlag: args.profile });
      ensureProfileExists(ctx);
      const code = await runCompose(ctx.home, ctx.profile.name, ['ps']);
      process.exit(code);
    },
  });
  ```

- [ ] Step 2: implement `shell`.

  ```ts
  // apps/cli/src/commands/shell.ts
  import { defineCommand } from 'citty';
  import { runCompose } from '../lib/compose.js';
  import { buildContext, ensureProfileExists } from '../lib/context.js';

  export default defineCommand({
    meta: { name: 'shell', description: 'bash inside agent container' },
    args: {
      profile: { type: 'string', description: 'override resolved profile' },
    },
    async run({ args }) {
      const ctx = buildContext({ profileFlag: args.profile });
      ensureProfileExists(ctx);
      const code = await runCompose(ctx.home, ctx.profile.name, ['exec', 'agent', 'bash']);
      process.exit(code);
    },
  });
  ```

- [ ] Step 3: implement `logs`.

  ```ts
  // apps/cli/src/commands/logs.ts
  import { defineCommand } from 'citty';
  import { runCompose } from '../lib/compose.js';
  import { buildContext, ensureProfileExists } from '../lib/context.js';

  export default defineCommand({
    meta: { name: 'logs', description: 'follow logs' },
    args: {
      profile: { type: 'string', description: 'override resolved profile' },
      tail: { type: 'string', description: 'lines of recent log to show', default: '50' },
      service: { type: 'string', description: 'service name or "all"', default: 'all' },
    },
    async run({ args }) {
      const ctx = buildContext({ profileFlag: args.profile });
      ensureProfileExists(ctx);
      const composeArgs = ['logs', '-f', '--tail', String(args.tail)];
      if (args.service && args.service !== 'all') composeArgs.push(String(args.service));
      const code = await runCompose(ctx.home, ctx.profile.name, composeArgs);
      process.exit(code);
    },
  });
  ```

- [ ] Step 4: implement `docker` passthrough.

  ```ts
  // apps/cli/src/commands/docker.ts
  import { defineCommand } from 'citty';
  import { runCompose } from '../lib/compose.js';
  import { buildContext, ensureProfileExists } from '../lib/context.js';

  export default defineCommand({
    meta: { name: 'docker', description: 'raw docker compose escape hatch' },
    args: {
      profile: { type: 'string', description: 'override resolved profile' },
      _: {
        type: 'positional',
        description: 'arguments forwarded verbatim to docker compose',
        required: false,
      },
    },
    async run({ args, rawArgs }) {
      const ctx = buildContext({ profileFlag: args.profile });
      ensureProfileExists(ctx);
      // strip our own flags from rawArgs; pass everything after the docker subcommand boundary
      const passthrough = stripOwnFlags(rawArgs ?? []);
      const code = await runCompose(ctx.home, ctx.profile.name, passthrough);
      process.exit(code);
    },
  });

  function stripOwnFlags(raw: string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < raw.length; i++) {
      const a = raw[i];
      if (a === '--profile') { i++; continue; }
      if (a.startsWith('--profile=')) continue;
      out.push(a);
    }
    return out;
  }
  ```

  Note: if Task 0.1 found that citty exposes `args._` as a parsed positional varargs without needing `rawArgs`, simplify accordingly. Adjust at implementation time.

- [ ] Step 5: commit.

  ```sh
  git add apps/cli/src/commands/{status,shell,logs,docker}.ts
  git commit -m "feat(cli): add status/shell/logs/docker commands"
  ```

## Phase 4 — Profile commands

### Task 4.1: `profile use`, `profile show`, `profile list`

**Files:**
- Create: `apps/cli/src/commands/profile-use.ts`
- Create: `apps/cli/src/commands/profile-show.ts`
- Create: `apps/cli/src/commands/profile-list.ts`
- Create: `apps/cli/src/commands/profile.ts`

- [ ] Step 1: implement `profile use`.

  ```ts
  // apps/cli/src/commands/profile-use.ts
  import { defineCommand } from 'citty';
  import { composeFileExists } from '../lib/compose.js';
  import { listProfiles } from '../lib/profile-list.js';
  import { resolveZenoHome } from '../lib/zeno-home.js';
  import { readState, writeState } from '../lib/state.js';

  export default defineCommand({
    meta: { name: 'use', description: 'select profile (writes apps/cli/.state.json)' },
    args: {
      name: { type: 'positional', required: true, description: 'profile name' },
    },
    run({ args }) {
      const home = resolveZenoHome();
      const name = String(args.name);
      if (!composeFileExists(home, name)) {
        console.error(`error: profile '${name}' not found`);
        console.error(`       valid profiles: ${listProfiles(home).join(', ') || '(none)'}`);
        process.exit(1);
      }
      const state = readState(home);
      writeState(home, { ...state, profile: name });
      console.log(`profile set to '${name}'`);
    },
  });
  ```

- [ ] Step 2: implement `profile show`.

  ```ts
  // apps/cli/src/commands/profile-show.ts
  import { defineCommand } from 'citty';
  import { buildContext } from '../lib/context.js';

  export default defineCommand({
    meta: { name: 'show', description: 'print resolved profile' },
    args: {
      profile: { type: 'string', description: 'override resolved profile' },
    },
    run({ args }) {
      const ctx = buildContext({ profileFlag: args.profile });
      console.log(`profile: ${ctx.profile.name} (source: ${ctx.profile.source})`);
    },
  });
  ```

- [ ] Step 3: implement `profile list`.

  ```ts
  // apps/cli/src/commands/profile-list.ts
  import { defineCommand } from 'citty';
  import { buildContext } from '../lib/context.js';
  import { listProfiles } from '../lib/profile-list.js';

  export default defineCommand({
    meta: { name: 'list', description: 'enumerate available profiles' },
    args: {
      profile: { type: 'string', description: 'override resolved profile' },
    },
    run({ args }) {
      const ctx = buildContext({ profileFlag: args.profile });
      const names = listProfiles(ctx.home);
      if (names.length === 0) {
        console.log('(no profiles found in infra/)');
        return;
      }
      for (const n of names) {
        console.log(`${n === ctx.profile.name ? '*' : ' '} ${n}`);
      }
    },
  });
  ```

- [ ] Step 4: implement `profile` umbrella.

  ```ts
  // apps/cli/src/commands/profile.ts
  import { defineCommand } from 'citty';
  import use from './profile-use.js';
  import show from './profile-show.js';
  import list from './profile-list.js';

  export default defineCommand({
    meta: { name: 'profile', description: 'switch profile / inspect selection' },
    subCommands: { use, show, list },
  });
  ```

- [ ] Step 5: commit.

  ```sh
  git add apps/cli/src/commands/profile*.ts
  git commit -m "feat(cli): add profile use/show/list commands"
  ```

## Phase 5 — Non-compose commands

### Task 5.1: `open`

**Files:**
- Create: `apps/cli/src/commands/open.ts`

- [ ] Step 1: implement.

  ```ts
  // apps/cli/src/commands/open.ts
  import { spawn } from 'node:child_process';
  import { defineCommand } from 'citty';

  const URL = 'http://localhost:3000';

  function platformOpener(): string {
    if (process.platform === 'darwin') return 'open';
    if (process.platform === 'win32') return 'start';
    if (process.env.WSL_DISTRO_NAME) return 'wslview';
    return 'xdg-open';
  }

  export default defineCommand({
    meta: { name: 'open', description: 'open dashboard in browser' },
    run() {
      const child = spawn(platformOpener(), [URL], { stdio: 'inherit' });
      child.on('exit', (code) => process.exit(code ?? 1));
      child.on('error', (err) => {
        console.error(`error: failed to open browser: ${err.message}`);
        console.error(`       open ${URL} manually`);
        process.exit(1);
      });
    },
  });
  ```

- [ ] Step 2: commit.

  ```sh
  git add apps/cli/src/commands/open.ts
  git commit -m "feat(cli): add open command (dashboard URL)"
  ```

### Task 5.2: `update`

**Files:**
- Create: `apps/cli/src/commands/update.ts`

- [ ] Step 1: implement.

  ```ts
  // apps/cli/src/commands/update.ts
  import { spawn } from 'node:child_process';
  import { defineCommand } from 'citty';
  import { resolveZenoHome } from '../lib/zeno-home.js';

  function run(cmd: string, args: string[], cwd: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: 'inherit', cwd });
      child.on('exit', (code) => resolve(code ?? 1));
      child.on('error', reject);
    });
  }

  export default defineCommand({
    meta: { name: 'update', description: 'git pull + rebuild' },
    async run() {
      const home = resolveZenoHome();
      const steps: Array<[string, string[]]> = [
        ['git', ['pull', '--ff-only']],
        ['pnpm', ['install', '--frozen-lockfile']],
        ['pnpm', ['build', '--filter', '@zeno/cli']],
      ];
      for (const [cmd, args] of steps) {
        const code = await run(cmd, args, home);
        if (code !== 0) {
          console.error(`error: '${cmd} ${args.join(' ')}' exited ${code}`);
          process.exit(code);
        }
      }
      console.log('zeno updated');
    },
  });
  ```

- [ ] Step 2: commit.

  ```sh
  git add apps/cli/src/commands/update.ts
  git commit -m "feat(cli): add update command (git pull + rebuild)"
  ```

### Task 5.3: `doctor`

**Files:**
- Create: `apps/cli/src/commands/doctor.ts`

- [ ] Step 1: implement.

  ```ts
  // apps/cli/src/commands/doctor.ts
  import { spawnSync } from 'node:child_process';
  import { existsSync } from 'node:fs';
  import { createConnection } from 'node:net';
  import { join } from 'node:path';
  import { defineCommand } from 'citty';
  import { buildContext } from '../lib/context.js';
  import { composeFileExists } from '../lib/compose.js';

  type CheckResult = { name: string; ok: boolean; skipped?: boolean; detail?: string };

  function dockerDaemonReachable(): CheckResult {
    const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
    return { name: 'docker daemon reachable', ok: r.status === 0 };
  }

  function homeExists(home: string): CheckResult {
    return { name: `$ZENO_HOME exists (${home})`, ok: existsSync(home) };
  }

  function composeExists(home: string, profile: string): CheckResult {
    return {
      name: `compose file for profile '${profile}' exists`,
      ok: composeFileExists(home, profile),
      detail: `infra/docker-compose.${profile}.yml`,
    };
  }

  function envExists(home: string, profile: string): CheckResult {
    const path = join(home, 'profiles', profile, '.env');
    return {
      name: `profile '${profile}' .env exists`,
      ok: existsSync(path),
      detail: path,
    };
  }

  function containerRunning(home: string, profile: string): CheckResult {
    const r = spawnSync(
      'docker',
      ['compose', '-f', `infra/docker-compose.${profile}.yml`, '--project-directory', home, 'ps', '--quiet', '--status', 'running'],
      { encoding: 'utf8' },
    );
    const ids = (r.stdout ?? '').trim().split(/\s+/).filter(Boolean);
    return { name: `agent container running`, ok: ids.length > 0 };
  }

  function dashboardReachable(): Promise<CheckResult> {
    return new Promise((resolve) => {
      const sock = createConnection({ host: '127.0.0.1', port: 3000 });
      const timer = setTimeout(() => { sock.destroy(); resolve({ name: 'dashboard port 3000 reachable', ok: false }); }, 1000);
      sock.on('connect', () => { clearTimeout(timer); sock.destroy(); resolve({ name: 'dashboard port 3000 reachable', ok: true }); });
      sock.on('error', () => { clearTimeout(timer); resolve({ name: 'dashboard port 3000 reachable', ok: false }); });
    });
  }

  export default defineCommand({
    meta: { name: 'doctor', description: 'preflight diagnostics' },
    args: {
      profile: { type: 'string', description: 'override resolved profile' },
    },
    async run({ args }) {
      const ctx = buildContext({ profileFlag: args.profile });
      const checks: CheckResult[] = [];
      checks.push(dockerDaemonReachable());
      checks.push(homeExists(ctx.home));
      checks.push(composeExists(ctx.home, ctx.profile.name));
      checks.push(envExists(ctx.home, ctx.profile.name));
      const running = containerRunning(ctx.home, ctx.profile.name);
      checks.push(running);
      if (running.ok) checks.push(await dashboardReachable());
      else checks.push({ name: 'dashboard port 3000 reachable', ok: true, skipped: true, detail: 'agent not running' });

      let failed = false;
      for (const c of checks) {
        const mark = c.skipped ? '○' : c.ok ? '✓' : '✗';
        const tail = c.detail ? `  (${c.detail})` : '';
        const note = c.skipped ? ' [skipped]' : '';
        console.log(`${mark} ${c.name}${note}${tail}`);
        if (!c.ok && !c.skipped) failed = true;
      }
      process.exit(failed ? 1 : 0);
    },
  });
  ```

- [ ] Step 2: commit.

  ```sh
  git add apps/cli/src/commands/doctor.ts
  git commit -m "feat(cli): add doctor command (preflight checks)"
  ```

## Phase 6 — CLI wire-up

### Task 6.1: root `index.ts`

**Files:**
- Modify: `apps/cli/src/index.ts`

- [ ] Step 1: replace empty placeholder with the root command.

  ```ts
  // apps/cli/src/index.ts
  import { defineCommand, runMain } from 'citty';
  import { resolveZenoHome } from './lib/zeno-home.js';
  import { readVersion } from './lib/version.js';

  import start from './commands/start.js';
  import stop from './commands/stop.js';
  import restart from './commands/restart.js';
  import status from './commands/status.js';
  import shell from './commands/shell.js';
  import logs from './commands/logs.js';
  import build from './commands/build.js';
  import doctor from './commands/doctor.js';
  import open from './commands/open.js';
  import update from './commands/update.js';
  import dockerCmd from './commands/docker.js';
  import profile from './commands/profile.js';

  let version: string;
  try { version = readVersion(resolveZenoHome()); } catch { version = '0.0.0-unknown'; }

  const main = defineCommand({
    meta: {
      name: 'zeno',
      version,
      description: 'zeno-agent CLI',
    },
    subCommands: {
      start, stop, restart, status, shell, logs, build,
      doctor, open, update,
      docker: dockerCmd,
      profile,
    },
  });

  runMain(main);
  ```

- [ ] Step 2: build and smoke test.

  ```sh
  pnpm --filter @zeno/cli build
  node apps/cli/dist/index.js --help
  ```

  Expected: help output lists every subcommand. Top of output shows `zeno v<version>` with the version pulled from root `package.json`.

- [ ] Step 3: commit.

  ```sh
  git add apps/cli/src/index.ts
  git commit -m "feat(cli): wire up subcommands in root index"
  ```

## Phase 7 — `infra/install.sh`

### Task 7.1: author the script

**Files:**
- Create: `infra/install.sh`

- [ ] Step 1: write the script.

  ```sh
  #!/bin/sh
  set -eu

  ZENO_HOME="${ZENO_HOME:-$HOME/zeno-agent}"
  BIN_DIR="$HOME/.local/bin"
  REPO_URL="https://github.com/ribeirogab/zeno-agent.git"

  if [ -e "$ZENO_HOME" ]; then
    printf 'error: %s already exists.\n' "$ZENO_HOME" >&2
    printf '       to update, run: zeno update\n' >&2
    printf '       to reinstall, remove the directory first.\n' >&2
    exit 1
  fi

  need() {
    command -v "$1" >/dev/null 2>&1 || {
      printf 'error: %s not found.\n' "$1" >&2
      printf '       %s\n' "$2" >&2
      exit 1
    }
  }
  need git    'install git: https://git-scm.com/downloads'
  need docker 'install Docker Desktop (mac/win) or Engine (linux): https://docs.docker.com/get-docker/'
  need node   'install Node.js 24 LTS: https://nodejs.org/ (recommend fnm/nvm)'
  need pnpm   'install pnpm 10: https://pnpm.io/installation'

  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$NODE_MAJOR" -lt 24 ]; then
    printf 'error: node 24+ required, got %s\n' "$(node -v)" >&2
    exit 1
  fi

  printf 'cloning %s into %s\n' "$REPO_URL" "$ZENO_HOME"
  git clone --depth 1 "$REPO_URL" "$ZENO_HOME"

  cd "$ZENO_HOME"
  pnpm install --frozen-lockfile
  pnpm build --filter @zeno/cli

  mkdir -p "$BIN_DIR"
  ln -sf "$ZENO_HOME/apps/cli/dist/index.js" "$BIN_DIR/zeno"
  chmod +x "$ZENO_HOME/apps/cli/dist/index.js"

  printf '\n✓ zeno installed at %s/zeno\n' "$BIN_DIR"

  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
      printf '\n  %s not in PATH.\n' "$BIN_DIR"
      RC=""
      case "${SHELL##*/}" in
        zsh)  RC="$HOME/.zshrc" ;;
        bash) RC="$HOME/.bashrc" ;;
        *)    RC="your shell rc" ;;
      esac
      printf '  add to %s:\n' "$RC"
      printf '    export PATH="$HOME/.local/bin:$PATH"\n'
      ;;
  esac

  printf '\nnext: configure profile (DASHBOARD_PASSWORD, USER.md, config.yaml) — see README.\n'
  ```

- [ ] Step 2: chmod + shellcheck.

  ```sh
  chmod +x infra/install.sh
  shellcheck infra/install.sh
  ```

  Expected: zero warnings. Fix any flagged.

  If `shellcheck` is not installed: `brew install shellcheck` (mac) or `apt install shellcheck` (linux).

### Task 7.2: end-to-end install dry run

- [ ] Step 1: run the installer against a temp `ZENO_HOME`.

  ```sh
  rm -rf /tmp/zeno-test
  ZENO_HOME=/tmp/zeno-test sh infra/install.sh
  ```

  Expected:
  - clone proceeds, pnpm install + build succeed
  - `~/.local/bin/zeno` symlink points at `/tmp/zeno-test/apps/cli/dist/index.js`
  - PATH hint printed if needed

- [ ] Step 2: invoke the installed CLI from a different cwd.

  ```sh
  cd /
  ~/.local/bin/zeno --help
  ZENO_HOME=/tmp/zeno-test ~/.local/bin/zeno --version
  ```

  Expected: help displays; version reflects `/tmp/zeno-test/package.json`.

- [ ] Step 3: confirm idempotency error path.

  ```sh
  ZENO_HOME=/tmp/zeno-test sh infra/install.sh
  ```

  Expected: exits non-zero with "already exists" message.

- [ ] Step 4: clean up temp install.

  ```sh
  rm -rf /tmp/zeno-test
  rm ~/.local/bin/zeno
  ```

### Task 7.3: commit Phase 7

- [ ] Step 1: stage + commit.

  ```sh
  git add infra/install.sh
  git commit -m "feat(cli): add infra/install.sh (curl|sh installer)"
  ```

## Phase 8 — Release workflow change

### Task 8.1: patch `.github/workflows/release.yml`

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] Step 1: insert Node + pnpm setup before the existing `Push tag` step, and add a `Bump version` step that pushes to `main` before tagging.

  After the `Resolve tag and title` step and before the `Push tag` step, insert:

  ```yaml
        - name: Setup Node
          uses: actions/setup-node@v4
          with:
            node-version: 24

        - name: Setup pnpm
          uses: pnpm/action-setup@v4
          with:
            version: 10

        - name: Bump root package.json version
          run: |
            TAG="${{ steps.resolve.outputs.tag }}"
            VER="${TAG#v}"
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            pnpm version "$VER" --no-git-tag-version
            git add package.json
            git commit -m "chore(release): $TAG"
            git push origin HEAD:main
  ```

  Then change the existing `Push tag` step to tag the bump commit (which is now `HEAD`, so the existing logic still works — but make the dependency explicit by removing the original `git config user.name` lines from `Push tag` since they are now in the bump step):

  ```yaml
        - name: Push tag
          run: |
            git tag "${{ steps.resolve.outputs.tag }}"
            git push origin "${{ steps.resolve.outputs.tag }}"
  ```

- [ ] Step 2: yamllint.

  ```sh
  yamllint .github/workflows/release.yml || true
  ```

  Expected: clean (warnings about line length OK).

- [ ] Step 3: commit.

  ```sh
  git add .github/workflows/release.yml
  git commit -m "ci(release): bump root package.json before tagging"
  ```

## Phase 9 — Docs + repo hygiene

### Task 9.1: update `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] Step 1: append two lines to `.gitignore`.

  ```
  # zeno-cli
  apps/cli/dist
  apps/cli/.state.json
  ```

- [ ] Step 2: confirm git no longer tracks build output.

  ```sh
  git status apps/cli
  ```

  Expected: only source files staged; `dist/` ignored.

- [ ] Step 3: commit.

  ```sh
  git add .gitignore
  git commit -m "chore(cli): gitignore dist + state"
  ```

### Task 9.2: rewrite README Quickstart

**Files:**
- Modify: `README.md`

- [ ] Step 1: replace the existing Quickstart block (currently lines ~16–35) with the following content. Keep everything else in the README intact (the "What it does", "What works today", "Setup notes", "Project layout", and "Contributing, security, license" sections all stay):

  ````markdown
  ## Quickstart

  Prerequisites:

  - `git`, `docker`, Node 24 LTS, pnpm 10
  - A Slack workspace where you can install a custom app (manifest: `infra/slack-app-manifest.json`)
  - A Claude account on a Pro or Max plan

  ### Install

  ```bash
  curl -fsSL https://raw.githubusercontent.com/ribeirogab/zeno-agent/main/infra/install.sh | sh
  ```

  This clones the repo to `~/zeno-agent` and installs `zeno` to `~/.local/bin/zeno`. Override the clone path with `ZENO_HOME=/path/to/dir curl ... | sh`. Source: [`infra/install.sh`](./infra/install.sh).

  ### Configure

  ```bash
  cd ~/zeno-agent
  cp profiles/default/.env.example profiles/default/.env
  cp profiles/default/USER.example.md profiles/default/USER.md
  cp profiles/default/config.example.yaml profiles/default/config.yaml
  echo "ZENO_MASTER_KEY=$(openssl rand -hex 32)" >> profiles/default/.env
  # then edit profiles/default/.env, USER.md, config.yaml
  ```

  ### Run

  ```bash
  zeno build
  zeno start
  zeno open  # opens http://localhost:3000
  ```

  Sign in with the `DASHBOARD_PASSWORD` you set in `.env`, click **Connect Claude** to complete the OAuth flow, install at least one connector from the catalogue, then mention the bot in any Slack channel where it is invited.

  ### Daily ops

  ```bash
  zeno status        # check health
  zeno logs          # tail logs (use --service worker|api to filter)
  zeno shell         # bash inside the container
  zeno restart       # bounce
  zeno doctor        # preflight diagnostics
  zeno update        # git pull + rebuild
  zeno --help        # full surface
  ```
  ````

- [ ] Step 2: render check.

  ```sh
  glow README.md  # or open in IDE preview
  ```

  Confirm code blocks render, headings hierarchy is correct, no broken anchors.

- [ ] Step 3: commit.

  ```sh
  git add README.md
  git commit -m "docs(readme): replace docker:* quickstart with zeno CLI"
  ```

### Task 9.3: update AGENTS.md commands table

**Files:**
- Modify: `AGENTS.md`

- [ ] Step 1: replace the existing commands table (rows starting with `pnpm run docker:*`) with this table. Keep `pnpm run quality-gate`. Do not remove `docker:setup-token` from `package.json` — that removal is owned by spec `2026-05-03-backend-auth-dashboard`. Other `docker:*` scripts also stay in `package.json` as a fallback per the spec's Non-Goals.

  ```markdown
  | Command | What it does |
  |---|---|
  | `zeno start` / `zeno stop` / `zeno restart` | Lifecycle of the agent container. |
  | `zeno status` / `zeno logs` / `zeno shell` | Daily ops. |
  | `zeno build` | Build the container image. |
  | `zeno doctor` | Preflight diagnostics (docker running, .env valid, profile resolves, etc.). |
  | `zeno open` | Open the dashboard at `http://localhost:3000`. |
  | `zeno update` | `git pull` + rebuild the CLI. |
  | `zeno profile use <name>` / `show` / `list` | Switch profiles. |
  | `zeno docker <args...>` | Raw docker compose escape hatch. |
  | `pnpm run quality-gate` | Lint + typecheck + tests across all workspaces. |
  ```

- [ ] Step 2: commit.

  ```sh
  git add AGENTS.md
  git commit -m "docs(agents): document zeno CLI as primary entry point"
  ```

## Phase 10 — Quality gate + verification

### Task 10.1: run quality gate

- [ ] Step 1: run.

  ```sh
  pnpm run quality-gate
  ```

  Expected: lint + typecheck + tests pass across all workspaces, including the new `@zeno/cli`.

  Fix any failures before proceeding.

### Task 10.2: full manual install + smoke

- [ ] Step 1: simulate first-time install from scratch.

  ```sh
  rm -rf /tmp/zeno-smoke
  ZENO_HOME=/tmp/zeno-smoke sh infra/install.sh
  ```

  Expected: success, symlink created.

- [ ] Step 2: confirm CLI surface from `/`.

  ```sh
  cd /
  ~/.local/bin/zeno --help
  ZENO_HOME=/tmp/zeno-smoke ~/.local/bin/zeno --version
  ZENO_HOME=/tmp/zeno-smoke ~/.local/bin/zeno profile list
  ZENO_HOME=/tmp/zeno-smoke ~/.local/bin/zeno doctor
  ```

  Expected:
  - `--help` lists every subcommand
  - `--version` prints `zeno v<root package version>`
  - `profile list` prints `default` (since the repo ships only `infra/docker-compose.default.yml`)
  - `doctor` runs all checks; agent-not-running checks are skipped; no crash

- [ ] Step 3: cleanup.

  ```sh
  rm -rf /tmp/zeno-smoke
  rm ~/.local/bin/zeno
  ```

### Task 10.3: light real-environment test (optional but recommended)

- [ ] Step 1: against the actual `~/zeno-agent` install (the maintainer's working clone), run:

  ```sh
  cd ~
  ~/.local/bin/zeno status
  ~/.local/bin/zeno logs --tail 5 --service worker
  ```

  Expected: real container state visible; logs print.

  This step is skipped if the maintainer is not on a machine with a configured `~/zeno-agent`.

## Phase 11 — Reflection + close

### Task 11.1: capture learnings

- [ ] Step 1: per the project rule, list non-obvious gotchas surfaced during implementation. Candidates:
  - citty API specifics that differed from training assumptions
  - tsup banner / shebang behavior
  - `pnpm version` on a `private: true` root
  - branch protection interaction with the workflow bot
  - Node module resolution through the symlinked bin
  - Anything else that took more than 5 minutes to figure out

  For each, create an atomic note in `vault/learnings/` using `vault/templates/learning.md` and link it from this spec via wikilink.

- [ ] Step 2: if nothing non-obvious surfaced, document that explicitly in this spec's frontmatter or close-out note ("No new learnings from this spec"). Silence is not reflection.

### Task 11.2: mark spec shipped

- [ ] Step 1: edit `vault/specs/2026-05-07-zeno-cli/spec.md` frontmatter:

  ```yaml
  status: shipped
  shipped: 2026-05-XX
  ```

- [ ] Step 2: tick all acceptance criteria checkboxes that are now verified.

- [ ] Step 3: commit.

  ```sh
  git add vault/specs/2026-05-07-zeno-cli/spec.md
  git commit -m "docs(spec): mark zeno-cli shipped"
  ```

### Task 11.3: open PR

- [ ] Step 1: run `/open-pr` slash command (per project rule). It generates the title and description automatically based on the branch + commits.

- [ ] Step 2: link the PR in the issue tracker (#5) so the roadmap entry can be ticked.
