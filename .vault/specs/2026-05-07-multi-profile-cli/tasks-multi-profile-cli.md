---
feature: multi-profile-cli
plan: "[[plan-multi-profile-cli]]"
spec: "[[spec-multi-profile-cli]]"
created: 2026-05-07
---
# Multi-Profile CLI — Tasks

**For this plan:** `[[plan-multi-profile-cli]]`

> All commits in this branch follow Conventional Commits. Branch name: `feat/multi-profile-cli`. Open the PR via `/open-pr` per project rule.
>
> Per global rule 20: never run `git add` / `commit` / `push` without explicit user approval. Each commit step assumes the operator has approved committing for that batch. If unsure, pause and ask.
>
> **Reference implementation:** the brainstorm-time prototype at `apps/cli-next/` (deleted in Task 5.4) is the canonical UX target for every command. When a task says "rewrite file content" or "replace content", port the corresponding file from `apps/cli-next/src/` verbatim and apply two swaps: (a) replace JSON state load/save (`apps/cli-next/src/lib/state.ts`) with calls into `@zeno/db/host` queries; (b) replace the `MockOrchestrator` shape with the new `DockerOrchestrator` from `apps/cli/src/lib/orchestrator/docker.ts`. The output formatting, spinner pacing, prompt copy, error messages, and command-line surface are stable and should not be re-invented — they are already validated.
>
> **Behavior reference:** every command's exact behavior (input validation, output shape, exit codes, side effects, audit-log entries) is fully specified in the [[spec|spec acceptance criteria]]. When a task summarizes behavior in one sentence, the AC is the source of truth — read both together.

---

## Phase 0 — Discovery

### Task 0.1: Verify `drizzle-orm` + `drizzle-kit` for SQLite + better-sqlite3

- [ ] **Step 1: query context7 for drizzle-orm SQLite usage**

  Run: query context7 with library `drizzle-team/drizzle-orm`, topic `sqlite better-sqlite3 schema migrations`. Capture: the import shape (`drizzle-orm/better-sqlite3` driver), schema column helpers (`integer`, `text`, `primaryKey`, `unique`), and the recommended pattern for multi-statement migrations.

- [ ] **Step 2: query context7 for drizzle-kit**

  Topic: `generate migrate config sqlite`. Capture: `drizzle.config.ts` shape for `dialect: 'sqlite'`, the `out` directory layout (`*.sql` files + `_meta/`), and the migrator API for runtime application.

- [ ] **Step 3: pin versions**

  Run: `npm view drizzle-orm versions --json | jq -r '.[]' | tail -5` and `npm view drizzle-kit versions --json | jq -r '.[]' | tail -5`. Record the pinned majors.

- [ ] **Step 4: write learning if surface diverges from assumptions**

  If the API differs materially from the spec's mental model, write `.vault/learnings/drizzle-sqlite-2026-05.md` summarizing the divergence. Otherwise skip.

### Task 0.2: Verify `dockerode` API surface

- [ ] **Step 1: query context7 for dockerode**

  Run: query context7 with library `apocas/dockerode`, topic `containerCreate containerStart containerStop containerRemove image inspect build logs follow listContainers labels`. Capture: signatures, the modern Promise-based vs callback split, and how to filter `listContainers` by label (e.g. `{ filters: { label: ['zeno.managed=true'] } }`).

- [ ] **Step 2: research streaming `image build` and `container logs`**

  Capture: the recommended way to consume `dockerode.buildImage()`'s readable stream and pipe progress to the operator (used by `start` auto-build), and the way to consume `container.logs({ follow: true, stdout: true, stderr: true, tail: N })` (used by `logs` command).

- [ ] **Step 3: pin version**

  Run: `npm view dockerode versions --json | jq -r '.[]' | tail -5`. Record.

- [ ] **Step 4: write learning if dockerode's modern API differs from training-data assumptions**

  Save to `.vault/learnings/dockerode-api-2026-05.md` if material.

### Task 0.3: Verify `gh release list` JSON output and GitHub REST releases endpoint

- [ ] **Step 1: run `gh release list --repo ribeirogab/zeno-agent --limit 3 --json tagName,isPrerelease,publishedAt,name`**

  Capture: the exact JSON keys and types. If `gh` is not authenticated locally, run `gh auth status` and proceed with REST verification only.

- [ ] **Step 2: curl GitHub REST**

  Run: `curl -s 'https://api.github.com/repos/ribeirogab/zeno-agent/releases?per_page=3' | jq '.[] | {tag_name, prerelease, published_at, name}'`. Capture: the unauthenticated rate-limit headers (`X-RateLimit-*`) and JSON shape. Confirm that 60 req/h is sufficient for the single-user case.

- [ ] **Step 3: write learning if either source is unstable**

  Save to `.vault/learnings/release-feed-2026-05.md` if observed quirks (e.g. CalVer tag sorting that doesn't follow `publishedAt`).

---

## Phase 1 — `@zeno/db/host` package

### Task 1.1: Scaffold the workspace

- [ ] **Step 1: create the package skeleton**

  Create `packages/db/package.json`:

  ```json
  {
    "name": "@zeno/db",
    "version": "0.0.1",
    "private": true,
    "type": "module",
    "main": "./dist/host/index.js",
    "types": "./dist/host/index.d.ts",
    "exports": {
      "./host": {
        "types": "./dist/host/index.d.ts",
        "import": "./dist/host/index.js"
      }
    },
    "scripts": {
      "build": "tsc -b",
      "test": "vitest run",
      "typecheck": "tsc --noEmit",
      "lint": "biome check .",
      "clean": "rm -rf dist",
      "db:host:generate": "drizzle-kit generate --config drizzle.host.config.ts",
      "db:host:check": "drizzle-kit check --config drizzle.host.config.ts"
    },
    "dependencies": {
      "better-sqlite3": "^12.9.0",
      "drizzle-orm": "<pinned-from-task-0.1>"
    },
    "devDependencies": {
      "@types/better-sqlite3": "^7.6.13",
      "drizzle-kit": "<pinned-from-task-0.1>",
      "typescript": "^6.0.2",
      "vitest": "^4.1.4"
    }
  }
  ```

- [ ] **Step 2: create tsconfig.json**

  Create `packages/db/tsconfig.json`:

  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "outDir": "./dist",
      "rootDir": "./src",
      "types": ["node"]
    },
    "include": ["src/**/*"],
    "exclude": ["dist", "node_modules"]
  }
  ```

- [ ] **Step 3: create vitest.config.ts**

  Create `packages/db/vitest.config.ts`:

  ```ts
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: { include: ['tests/**/*.test.ts'] },
  });
  ```

- [ ] **Step 4: install deps**

  Run: `pnpm install`. Verify `node_modules/.pnpm/drizzle-orm@*` and `node_modules/.pnpm/drizzle-kit@*` exist.

- [ ] **Step 5: commit**

  Stage: `git add packages/db/package.json packages/db/tsconfig.json packages/db/vitest.config.ts pnpm-lock.yaml`.

  Commit message: `chore(db): scaffold @zeno/db workspace with host subpath`.

### Task 1.2: Add `shared/client.ts`

- [ ] **Step 1: write the failing test**

  Create `packages/db/tests/client.test.ts`:

  ```ts
  import { unlinkSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { afterEach, expect, it } from 'vitest';
  import { closeSqlite, openSqlite } from '../src/shared/client.js';

  const TMP = join(tmpdir(), `zeno-db-client-${Date.now()}.db`);

  afterEach(() => {
    try { unlinkSync(TMP); } catch {}
    try { unlinkSync(`${TMP}-wal`); } catch {}
    try { unlinkSync(`${TMP}-shm`); } catch {}
  });

  it('opens with WAL and required pragmas', () => {
    const db = openSqlite(TMP);
    const wal = db.pragma('journal_mode', { simple: true });
    const sync = db.pragma('synchronous', { simple: true });
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(wal).toBe('wal');
    expect(sync).toBe(1); // NORMAL
    expect(fk).toBe(1);
    closeSqlite(db);
  });
  ```

- [ ] **Step 2: run test to verify it fails**

  Run: `pnpm --filter @zeno/db test`. Expected: FAIL (`openSqlite` not defined).

- [ ] **Step 3: implement client.ts**

  Create `packages/db/src/shared/client.ts`:

  ```ts
  import Database from 'better-sqlite3';

  export type DB = Database.Database;

  export function openSqlite(path: string): DB {
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    return db;
  }

  export function closeSqlite(db: DB): void {
    db.close();
  }
  ```

- [ ] **Step 4: run test to verify it passes**

  Run: `pnpm --filter @zeno/db test`. Expected: PASS.

- [ ] **Step 5: commit**

  Stage: `git add packages/db/src/shared/client.ts packages/db/tests/client.test.ts`.

  Commit: `feat(db): add shared sqlite client with WAL pragmas`.

### Task 1.3: Define `host/schema.ts` (drizzle)

- [ ] **Step 1: write schema using the API confirmed in Task 0.1**

  Create `packages/db/src/host/schema.ts`:

  ```ts
  import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

  export const profiles = sqliteTable('profiles', {
    name:          text('name').primaryKey(),
    port:          integer('port').notNull().unique(),
    masterKey:     text('master_key').notNull(),
    status:        text('status', { enum: ['running', 'stopped', 'failed'] }).notNull().default('stopped'),
    createdAt:     integer('created_at').notNull(),
    lastStartedAt: integer('last_started_at'),
    lastStoppedAt: integer('last_stopped_at'),
  });

  export const settings = sqliteTable('settings', {
    key:   text('key').primaryKey(),
    value: text('value').notNull(),
  });

  export const auditLog = sqliteTable('audit_log', {
    id:      integer('id').primaryKey({ autoIncrement: true }),
    ts:      integer('ts').notNull(),
    action:  text('action').notNull(),
    target:  text('target'),
    details: text('details').notNull().default('{}'),
  });

  // schema_migrations is managed by the migrate runner — no drizzle table needed
  ```

- [ ] **Step 2: typecheck only (no test yet — schema is validated by migration generation)**

  Run: `pnpm --filter @zeno/db typecheck`. Expected: PASS.

- [ ] **Step 3: commit**

  Stage: `git add packages/db/src/host/schema.ts`.

  Commit: `feat(db): define host schema (profiles, settings, audit_log)`.

### Task 1.4: Generate the first migration with drizzle-kit

- [ ] **Step 1: create drizzle.host.config.ts**

  Create `packages/db/drizzle.host.config.ts`:

  ```ts
  import type { Config } from 'drizzle-kit';

  export default {
    schema: './src/host/schema.ts',
    out: './src/host/migrations',
    dialect: 'sqlite',
  } satisfies Config;
  ```

- [ ] **Step 2: run drizzle-kit generate**

  Run: `pnpm --filter @zeno/db run db:host:generate`.

  Expected: creates `packages/db/src/host/migrations/0000_<random-name>.sql` plus `packages/db/src/host/migrations/_meta/_journal.json`. Inspect the SQL — it should contain `CREATE TABLE profiles ...`, `CREATE TABLE settings ...`, `CREATE TABLE audit_log ...`, with the UNIQUE constraint on `port`.

- [ ] **Step 3: commit generated artifacts**

  Stage: `git add packages/db/drizzle.host.config.ts packages/db/src/host/migrations/`.

  Commit: `feat(db): generate initial host migration`.

### Task 1.5: Implement `shared/migrate.ts` runner

- [ ] **Step 1: write the failing test**

  Create `packages/db/tests/migrations.test.ts`:

  ```ts
  import { unlinkSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { afterEach, expect, it } from 'vitest';
  import { openSqlite, closeSqlite } from '../src/shared/client.js';
  import { runHostMigrations } from '../src/host/index.js';

  const TMP = join(tmpdir(), `zeno-mig-${Date.now()}.db`);

  afterEach(() => {
    try { unlinkSync(TMP); } catch {}
    try { unlinkSync(`${TMP}-wal`); } catch {}
    try { unlinkSync(`${TMP}-shm`); } catch {}
  });

  it('applies all migrations to a fresh DB', () => {
    const db = openSqlite(TMP);
    runHostMigrations(db);
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('profiles');
    expect(names).toContain('settings');
    expect(names).toContain('audit_log');
    expect(names).toContain('schema_migrations');
    closeSqlite(db);
  });

  it('is idempotent on re-run', () => {
    const db = openSqlite(TMP);
    runHostMigrations(db);
    const v1 = db.prepare(`SELECT COUNT(*) as c FROM schema_migrations`).get() as { c: number };
    runHostMigrations(db);
    const v2 = db.prepare(`SELECT COUNT(*) as c FROM schema_migrations`).get() as { c: number };
    expect(v2.c).toBe(v1.c);
    closeSqlite(db);
  });
  ```

- [ ] **Step 2: run test to verify it fails**

  Run: `pnpm --filter @zeno/db test`. Expected: FAIL (`runHostMigrations` not exported).

- [ ] **Step 3: implement `shared/migrate.ts`**

  Create `packages/db/src/shared/migrate.ts`:

  ```ts
  import { readdirSync, readFileSync } from 'node:fs';
  import { join } from 'node:path';
  import type { DB } from './client.js';

  export interface MigrationFile {
    version: number;
    name: string;
    sql: string;
  }

  export function loadMigrations(dir: string): MigrationFile[] {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => {
        const match = f.match(/^(\d+)_(.+)\.sql$/);
        if (!match) throw new Error(`bad migration filename: ${f}`);
        return {
          version: Number(match[1]),
          name: match[2]!,
          sql: readFileSync(join(dir, f), 'utf8'),
        };
      });
  }

  export function applyMigrations(db: DB, migrations: MigrationFile[]): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);
    const applied = new Set(
      (db.prepare(`SELECT version FROM schema_migrations`).all() as { version: number }[]).map((r) => r.version),
    );
    const insert = db.prepare(`INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`);
    const tx = db.transaction((batch: MigrationFile[]) => {
      for (const m of batch) {
        if (applied.has(m.version)) continue;
        db.exec(m.sql);
        insert.run(m.version, m.name, Date.now());
      }
    });
    tx(migrations);
  }
  ```

- [ ] **Step 4: implement `host/index.ts` to wire migrations**

  Create `packages/db/src/host/index.ts`:

  ```ts
  import { dirname, join } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import type { DB } from '../shared/client.js';
  import { applyMigrations, loadMigrations } from '../shared/migrate.js';

  export { openSqlite, closeSqlite } from '../shared/client.js';
  export type { DB } from '../shared/client.js';
  export * as schema from './schema.js';

  const HERE = dirname(fileURLToPath(import.meta.url));
  const MIGRATIONS_DIR = join(HERE, 'migrations');

  export function runHostMigrations(db: DB): void {
    applyMigrations(db, loadMigrations(MIGRATIONS_DIR));
  }
  ```

- [ ] **Step 5: run tests**

  Run: `pnpm --filter @zeno/db test`. Expected: both tests PASS. If drizzle-kit's filename pattern differs from `^(\d+)_(.+)\.sql$`, adjust the regex in `loadMigrations`.

- [ ] **Step 6: commit**

  Stage: `git add packages/db/src/shared/migrate.ts packages/db/src/host/index.ts packages/db/tests/migrations.test.ts`.

  Commit: `feat(db): add forward-only migration runner for host schema`.

### Task 1.6: Implement `host/queries.ts`

- [ ] **Step 1: write the failing test**

  Create `packages/db/tests/queries.test.ts`:

  ```ts
  import { unlinkSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { afterEach, beforeEach, describe, expect, it } from 'vitest';
  import { closeSqlite, openSqlite, runHostMigrations } from '../src/host/index.js';
  import * as q from '../src/host/queries.js';

  const TMP = join(tmpdir(), `zeno-q-${Date.now()}.db`);
  let db: ReturnType<typeof openSqlite>;

  beforeEach(() => {
    db = openSqlite(TMP);
    runHostMigrations(db);
  });

  afterEach(() => {
    closeSqlite(db);
    try { unlinkSync(TMP); } catch {}
    try { unlinkSync(`${TMP}-wal`); } catch {}
    try { unlinkSync(`${TMP}-shm`); } catch {}
  });

  describe('profile CRUD', () => {
    it('creates and reads back', () => {
      q.createProfile(db, { name: 'personal', port: 6101, masterKey: 'k1' });
      const row = q.findProfile(db, 'personal');
      expect(row?.port).toBe(6101);
    });

    it('lists in created order', () => {
      q.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
      q.createProfile(db, { name: 'b', port: 6102, masterKey: 'k' });
      const list = q.listProfiles(db);
      expect(list.map((r) => r.name)).toEqual(['a', 'b']);
    });

    it('rejects duplicate port', () => {
      q.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
      expect(() => q.createProfile(db, { name: 'b', port: 6101, masterKey: 'k' })).toThrow();
    });

    it('rejects duplicate name', () => {
      q.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
      expect(() => q.createProfile(db, { name: 'a', port: 6102, masterKey: 'k' })).toThrow();
    });

    it('updates port', () => {
      q.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
      q.updateProfilePort(db, 'a', 6105);
      expect(q.findProfile(db, 'a')?.port).toBe(6105);
    });

    it('deletes', () => {
      q.createProfile(db, { name: 'a', port: 6101, masterKey: 'k' });
      q.deleteProfile(db, 'a');
      expect(q.findProfile(db, 'a')).toBeUndefined();
    });
  });

  describe('sticky', () => {
    it('round-trip sticky default', () => {
      q.setSticky(db, 'personal');
      expect(q.getSticky(db)).toBe('personal');
      q.setSticky(db, null);
      expect(q.getSticky(db)).toBeNull();
    });
  });

  describe('audit', () => {
    it('appends and lists', () => {
      q.appendAudit(db, { action: 'profile.create', target: 'personal', details: { port: 6101 } });
      const rows = q.listAudit(db, { limit: 10 });
      expect(rows[0]?.action).toBe('profile.create');
      expect(rows[0]?.target).toBe('personal');
    });
  });
  ```

- [ ] **Step 2: implement `host/queries.ts`**

  Create `packages/db/src/host/queries.ts` with typed functions for `createProfile`, `findProfile`, `listProfiles`, `updateProfilePort`, `updateProfileStatus`, `deleteProfile`, `setSticky`, `getSticky`, `setVersion`, `getVersion`, `appendAudit`, `listAudit`. Use drizzle's query builder where ergonomic; fall back to `db.prepare(...)` for trivial cases. Status updates take `{ status, lastStartedAt?, lastStoppedAt? }`.

- [ ] **Step 3: re-export from `host/index.ts`**

  Edit `packages/db/src/host/index.ts` and add `export * as queries from './queries.js';` plus a flat re-export of the most common ones.

- [ ] **Step 4: run tests**

  Run: `pnpm --filter @zeno/db test`. Expected: all tests PASS.

- [ ] **Step 5: commit**

  Stage: `git add packages/db/src/host/queries.ts packages/db/src/host/index.ts packages/db/tests/queries.test.ts`.

  Commit: `feat(db): add typed host queries (profiles, sticky, audit, version)`.

### Task 1.7: Workspace build + quality gate

- [ ] **Step 1: typecheck**

  Run: `pnpm --filter @zeno/db typecheck`. Expected: clean.

- [ ] **Step 2: build**

  Run: `pnpm --filter @zeno/db build`. Verify `packages/db/dist/host/index.js` and `dist/host/index.d.ts` exist.

- [ ] **Step 3: tsc inline lint check via biome**

  Run: `pnpm --filter @zeno/db lint`. Fix any findings.

- [ ] **Step 4: full quality gate (sanity)**

  Run: `pnpm run quality-gate`. Expected: pass for the new package; existing packages should still pass (we haven't touched them).

- [ ] **Step 5: commit any lint fixes**

  If biome auto-rewrote anything, stage and commit: `chore(db): biome auto-fix`.

---

## Phase 2 — Templates + .gitignore

### Task 2.1: Create `templates/profile/USER.md`

- [ ] **Step 1: copy current `profiles/default/USER.example.md` content**

  Read `profiles/default/USER.example.md` and copy its body into `templates/profile/USER.md`. Replace the literal `<how Zeno should address you in conversations>` placeholder with `<your-name>` (the CLI substitution token). Replace the timezone placeholder with `<auto-detected-tz>`.

- [ ] **Step 2: drop the "Setup" paragraph that references `USER.example.md` → `USER.md`**

  In the new file, the "Setup" paragraph is no longer relevant — the CLI generates the file. Replace with one-line maintainer comment at the top: `<!-- This file is generated by `zeno profile create` from templates/profile/USER.md. The CLI substitutes <your-name> and <auto-detected-tz>. Edit your local copy at ~/.zeno/profiles/<profile>/USER.md to add Preferences and Context. -->`

- [ ] **Step 3: commit**

  Stage: `git add templates/profile/USER.md`.

  Commit: `feat(templates): add canonical USER.md template`.

### Task 2.2: Create `templates/profile/env.template`

- [ ] **Step 1: write file**

  Create `templates/profile/env.template`:

  ```
  # managed by zeno CLI — manual edits to ZENO_MASTER_KEY will be overwritten on next start
  ZENO_MASTER_KEY=<generated>
  ```

  (CLI substitutes `<generated>` with a 64-hex random value at `profile create` time.)

- [ ] **Step 2: commit**

  Stage: `git add templates/profile/env.template`.

  Commit: `feat(templates): add canonical env template`.

### Task 2.3: Create `templates/profile/README.md`

- [ ] **Step 1: write the README**

  Create `templates/profile/README.md`:

  ```markdown
  # Profile Templates

  Read-only blueprints used by `zeno profile create` to scaffold a new profile under `~/.zeno/profiles/<name>/`.

  - `USER.md` — identity + preferences template. Placeholders `<your-name>` and `<auto-detected-tz>` are substituted by the CLI.
  - `env.template` — env vars template. The CLI generates `ZENO_MASTER_KEY` and writes the result to `~/.zeno/profiles/<name>/.env`.

  **These files are never edited per-instance.** They are the canonical source the CLI reads from. Editing them changes the scaffold for every future `zeno profile create`. Operator-facing edits live under `~/.zeno/profiles/<profile>/`, not here.
  ```

- [ ] **Step 2: commit**

  Stage: `git add templates/profile/README.md`.

  Commit: `docs(templates): add maintainer-facing README`.

### Task 2.4: Delete old `profiles/` from the repo

- [ ] **Step 1: verify no other code reads from `profiles/`**

  Run: `grep -rn 'profiles/default' apps/ packages/ infra/ agent/ --include='*.ts' --include='*.sh' --include='*.md' | grep -v node_modules | grep -v .vault/`. If any matches surface, address them in this task or document why they remain.

- [ ] **Step 2: delete files**

  Run: `git rm profiles/default/USER.example.md profiles/default/.env.example profiles/default/config.example.yaml profiles/default/README.md` (and any other files inside `profiles/default/`).

- [ ] **Step 3: delete the now-empty directories**

  Run: `rmdir profiles/default profiles 2>/dev/null` (or just delete them via filesystem if `rmdir` fails on non-empty — there should be nothing left).

- [ ] **Step 4: commit**

  Stage: any remaining `git rm` artifacts and the deletions are already staged.

  Commit: `chore: remove profiles/ from repo (templates moved to templates/profile/)`.

### Task 2.5: Replace `.gitignore` profile rules

- [ ] **Step 1: edit `.gitignore`**

  In `.gitignore` at the repo root, replace the block:

  ```gitignore
  # Profiles — only default's examples are committed by default
  profiles/*/
  !profiles/default/
  profiles/default/*
  !profiles/default/.env.example
  !profiles/default/USER.example.md
  !profiles/default/config.example.yaml

  # Profile skills live on disk and are seeded into the DB at boot;
  # they are intentionally not tracked in git. Profiles other than
  # `default` follow the `profiles/*/` rule above.

  # Profile-specific compose files (only default is committed)
  infra/docker-compose.*.yml
  !infra/docker-compose.default.yml

  # Root .env no longer used (each profile has its own)
  /.env
  /.env.*

  # Agent config (only example is committed)
  agent/config.yaml
  ```

  with:

  ```gitignore
  # Profiles never live in the repo (templates → templates/profile/, instances → ~/.zeno/profiles/).
  # Defense in depth: if anything ever lands here, it stays out of git.
  profiles/

  # Root .env no longer used (each profile has its own)
  /.env
  /.env.*
  ```

- [ ] **Step 2: verify**

  Run: `git status --ignored | grep profiles` — expected: no committed `profiles/` paths shown (folder doesn't exist anymore).

- [ ] **Step 3: commit**

  Stage: `git add .gitignore`.

  Commit: `chore(gitignore): block profiles/ entirely; drop legacy whitelists`.

---

## Phase 3 — Kill `config.yaml`

### Task 3.1: Delete `apps/worker/src/cron/static-loader.ts` + tests

- [ ] **Step 1: delete files**

  Run: `git rm apps/worker/src/cron/static-loader.ts apps/worker/tests/cron/static-loader.test.ts`.

- [ ] **Step 2: if `apps/worker/src/cron/` becomes empty after the file is removed, delete the directory too**

  Check: `ls apps/worker/src/cron/` — if empty, `rmdir apps/worker/src/cron`.

- [ ] **Step 3: commit (deferred)**

  Hold the commit until after the corresponding call sites in `index.ts` are removed (Task 3.3) — otherwise the worker will fail to compile.

### Task 3.2: Prune `config.yaml` branch from `apps/worker/src/profile/watcher.ts`

- [ ] **Step 1: read current watcher**

  Read `apps/worker/src/profile/watcher.ts` and locate:
  - The `classify()` branch that returns `'crons'` for `source === 'profile' && normalized === 'config.yaml'` (around line 188).
  - The `onCronsChanged` field in `ProfileWatcherOptions`.
  - The dispatch in the change handler that invokes `onCronsChanged` when classification is `'crons'`.

- [ ] **Step 2: delete those references**

  Edit the file: remove the `'crons'` branch from `classify()`, remove `onCronsChanged` from the options interface, remove the dispatch block. The watcher should still watch `USER.md` and `.env` (the remaining `'identity'` and `'env'` cases, if present).

- [ ] **Step 3: update the test file**

  Read `apps/worker/tests/profile/watcher.test.ts`. Delete every test case whose subject is `config.yaml` or `onCronsChanged`. Keep tests for the remaining classification branches.

- [ ] **Step 4: typecheck**

  Run: `pnpm --filter zeno-worker typecheck`. Expected: errors at any caller still passing `onCronsChanged` (these are addressed in Task 3.3).

- [ ] **Step 5: hold the commit**

  Same as 3.1 — defer to 3.3 to keep the worker compiling.

### Task 3.3: Remove call sites in `apps/worker/src/index.ts`

- [ ] **Step 1: read worker's `index.ts`**

  Locate the `loadStaticCrons` import, the `onCronsChanged` callback wired into `createProfileWatcher` (or however the watcher is constructed), and any place `loadStaticCrons` is called at boot.

- [ ] **Step 2: delete imports + call site + callback wiring**

  Remove the import line. Remove the `onCronsChanged: ...` option. Remove the boot-time call to `loadStaticCrons` (and any helper function that exists only for it).

- [ ] **Step 3: typecheck**

  Run: `pnpm --filter zeno-worker typecheck`. Expected: clean.

- [ ] **Step 4: run worker tests**

  Run: `pnpm --filter zeno-worker test`. Expected: pass (cron tests are gone; watcher tests cover the surviving branches).

- [ ] **Step 5: commit batch (3.1 + 3.2 + 3.3 together)**

  Stage all changes from 3.1, 3.2, 3.3.

  Commit: `refactor(worker): drop config.yaml-driven static cron loader and watcher branch`.

### Task 3.4: Simplify `apps/worker/src/github/git-identity.ts`

- [ ] **Step 1: read current file**

  Confirm `parseGitIdentityFromConfig`, the `yaml` import, and the `DEFAULT_CANDIDATES` constant exist (they do, per `apps/worker/src/github/git-identity.ts:13-41`).

- [ ] **Step 2: edit**

  Delete `parseGitIdentityFromConfig`, the `yaml` import, and `DEFAULT_CANDIDATES`. Edit `resolveGitIdentity()` to call only `resolveGitIdentityFromGhCli()` and fall back to logging `git_identity_unavailable` and returning `null`. The exported surface keeps `resolveGitIdentity`, `resolveGitIdentityFromGhCli`, `buildGitEnv`, and the `GitIdentity` type.

- [ ] **Step 3: update tests**

  Read `apps/worker/tests/github/git-identity.test.ts`. Delete every test case targeting `parseGitIdentityFromConfig`. Keep tests for `resolveGitIdentityFromGhCli` and `buildGitEnv`. If the `gh-cli` resolution test was missing, add a smoke test that mocks `execSync` to return a deterministic string and asserts the parsed `name`/`email`.

- [ ] **Step 4: typecheck + tests**

  Run: `pnpm --filter zeno-worker typecheck && pnpm --filter zeno-worker test`. Expected: clean + green.

- [ ] **Step 5: commit**

  Stage: `git add apps/worker/src/github/git-identity.ts apps/worker/tests/github/git-identity.test.ts`.

  Commit: `refactor(worker): drop config.yaml git_identity parser; gh api fallback only`.

### Task 3.5: Simplify `infra/entrypoint.sh`

- [ ] **Step 1: write new entrypoint**

  Replace `infra/entrypoint.sh` with exactly:

  ```sh
  #!/bin/sh
  set -eu
  exec "$@"
  ```

- [ ] **Step 2: commit**

  Stage: `git add infra/entrypoint.sh`.

  Commit: `refactor(infra): simplify entrypoint to exec passthrough`.

### Task 3.6: Delete `agent/config.example.yaml`

- [ ] **Step 1: delete**

  Run: `git rm agent/config.example.yaml`.

- [ ] **Step 2: commit**

  Stage: already done by `git rm`.

  Commit: `chore: remove agent/config.example.yaml (config.yaml killed)`.

### Task 3.7: Verify `config.yaml` is gone everywhere

- [ ] **Step 1: grep check**

  Run: `grep -rn 'config\.ya\?ml' apps/ packages/ infra/ agent/ --include='*.ts' --include='*.sh' --include='*.md' --include='*.json' --include='*.yml' --include='*.yaml' | grep -v node_modules | grep -v .vault/`.

  Expected: zero matches outside `.vault/specs/` historical specs.

- [ ] **Step 2: full quality gate**

  Run: `pnpm run quality-gate`. Expected: pass.

- [ ] **Step 3: smoke test the worker still boots**

  Build the image and start a single profile manually (use the legacy compose temporarily or `docker run` directly with mounts equivalent to the spec). Verify the worker logs `git_identity_from_gh` (or `git_identity_unavailable`) at boot — never `git_identity_from_config`.

  This step is informational; the legacy compose files still exist at this point in the timeline.

---

## Phase 4 — CLI rewrite

### Task 4.1: Update `apps/cli/package.json` deps

- [ ] **Step 1: edit deps**

  Edit `apps/cli/package.json`. Add to `dependencies`:

  ```
  "@zeno/db": "workspace:*",
  "better-sqlite3": "^12.9.0",
  "dockerode": "<pinned-from-task-0.2>"
  ```

  Add to `devDependencies`:

  ```
  "@types/better-sqlite3": "^7.6.13",
  "@types/dockerode": "^3.3.39"
  ```

- [ ] **Step 2: install**

  Run: `pnpm install`. Verify lockfile updates.

- [ ] **Step 3: commit**

  Stage: `git add apps/cli/package.json pnpm-lock.yaml`.

  Commit: `chore(cli): add dockerode + drizzle/sqlite deps`.

### Task 4.2: Add `apps/cli/src/lib/paths.ts`

- [ ] **Step 1: write file**

  Create `apps/cli/src/lib/paths.ts`:

  ```ts
  import { homedir } from 'node:os';
  import { join } from 'node:path';

  export const ZENO_DATA = join(homedir(), '.zeno');
  export const ZENO_HOME = join(ZENO_DATA, 'zeno-agent');
  export const STATE_DB_PATH = join(ZENO_DATA, 'state.db');

  export function profileDir(name: string): string {
    return join(ZENO_DATA, 'profiles', name);
  }

  export function profileEnvFile(name: string): string {
    return join(profileDir(name), '.env');
  }

  export function profileUserMd(name: string): string {
    return join(profileDir(name), 'USER.md');
  }

  export function templatesProfileDir(): string {
    return join(ZENO_HOME, 'templates', 'profile');
  }

  export function agentMountSource(): string {
    return join(ZENO_HOME, 'agent');
  }
  ```

- [ ] **Step 2: commit**

  Stage: `git add apps/cli/src/lib/paths.ts`.

  Commit: `feat(cli): add canonical path helpers`.

### Task 4.3: Add `apps/cli/src/lib/output.ts` (port from `cli-next`)

- [ ] **Step 1: copy from `apps/cli-next/src/lib/output.ts` to `apps/cli/src/lib/output.ts`**

  Verbatim copy of the file written during the brainstorm prototype. No changes — output helpers are stable.

- [ ] **Step 2: commit**

  Stage: `git add apps/cli/src/lib/output.ts`.

  Commit: `feat(cli): add ANSI output helpers + table formatting`.

### Task 4.4: Add `apps/cli/src/lib/spinner.ts` (port from `cli-next`)

- [ ] **Step 1: copy from `apps/cli-next/src/lib/spinner.ts`**

  Verbatim copy.

- [ ] **Step 2: commit**

  Stage: `git add apps/cli/src/lib/spinner.ts`.

  Commit: `feat(cli): add spinner helper for long ops`.

### Task 4.5: Add `apps/cli/src/lib/templates.ts`

- [ ] **Step 1: write the failing test**

  Create `apps/cli/tests/lib/templates.test.ts` exercising: read template files, substitute `<your-name>` and `<auto-detected-tz>`, write to a tmp dir matching `~/.zeno/profiles/<name>/` layout.

- [ ] **Step 2: implement `apps/cli/src/lib/templates.ts`**

  Functions:
  - `readUserTemplate(): string` — reads `templates/profile/USER.md`
  - `readEnvTemplate(): string` — reads `templates/profile/env.template`
  - `renderUserMd({ name, timezone }): string` — substitutes placeholders
  - `renderEnv({ masterKey }): string` — substitutes `<generated>`
  - `materializeProfile({ profile, owner, timezone, masterKey })` — writes both files into `profileDir(profile)`, creates the dir if missing.

- [ ] **Step 3: tests pass**

  Run: `pnpm --filter @zeno/cli test`. Expected: green.

- [ ] **Step 4: commit**

  Stage: `git add apps/cli/src/lib/templates.ts apps/cli/tests/lib/templates.test.ts`.

  Commit: `feat(cli): add template renderer for profile scaffolding`.

### Task 4.6: Add `apps/cli/src/lib/env-file.ts`

- [ ] **Step 1: write the failing test**

  Create `apps/cli/tests/lib/env-file.test.ts`. Cover: round-trip preserves keys not managed by CLI, `ZENO_MASTER_KEY` is overwritten, the managed-by header is the first line, operator-added keys survive.

- [ ] **Step 2: implement `apps/cli/src/lib/env-file.ts`**

  Functions:
  - `parseEnvFile(content: string): Map<string, string>` (preserves order)
  - `serializeEnvFile(entries, header): string`
  - `rewriteMasterKey(path: string, masterKey: string): void` — reads, parses, replaces `ZENO_MASTER_KEY`, ensures header is the first line, writes back.

- [ ] **Step 3: tests pass**

  Run: `pnpm --filter @zeno/cli test`. Expected: green.

- [ ] **Step 4: commit**

  Stage: `git add apps/cli/src/lib/env-file.ts apps/cli/tests/lib/env-file.test.ts`.

  Commit: `feat(cli): add env-file rewriter preserving operator keys`.

### Task 4.7: Add `apps/cli/src/lib/profile.ts` (DB-backed validation + sticky)

- [ ] **Step 1: write the failing test**

  Create `apps/cli/tests/lib/profile.test.ts`. Cover: name regex (`^[a-z][a-z0-9-]{0,30}$`), port range `[6101, 6200]`, port allocation finds the lowest free, `requireProfile` exits when missing, `resolveName` resolves sticky.

- [ ] **Step 2: implement `apps/cli/src/lib/profile.ts`**

  Replace the existing file. Imports from `@zeno/db/host`. Functions:
  - `NAME_RE`, `PORT_MIN`, `PORT_MAX` constants
  - `validateName(name): true | string`
  - `nextAvailablePort(db): number | null`
  - `isPortTaken(db, port, exceptName?): boolean`
  - `resolveName(db, arg?): string` — uses sticky, exits with message if neither
  - `requireProfile(db, name): ProfileRow` — exits with message if not found
  - `generateMasterKey(): string` — uses `crypto.randomBytes(32).toString('hex')`

- [ ] **Step 3: tests pass**

  Run: `pnpm --filter @zeno/cli test`. Expected: green.

- [ ] **Step 4: commit**

  Stage: `git add apps/cli/src/lib/profile.ts apps/cli/tests/lib/profile.test.ts`.

  Commit: `feat(cli): add DB-backed profile resolver + validators`.

### Task 4.8: Add `apps/cli/src/lib/orchestrator/types.ts`

- [ ] **Step 1: define the interface**

  Create `apps/cli/src/lib/orchestrator/types.ts`:

  ```ts
  export interface ContainerSpec {
    name: string;
    profile: string;
    port: number;
    envFile: string;
    workspaceVolume: string;
    claudeHomeVolume: string;
    agentMountSource: string;
    profileMountSource: string;
  }

  export interface ContainerInfo {
    name: string;
    profile: string;
    port: number;
    state: 'running' | 'stopped' | 'failed';
    startedAt: string | null;
  }

  export interface Orchestrator {
    imageExists(tag: string): Promise<boolean>;
    buildImage(opts: { tag: string; dockerfile: string; context: string; onProgress?: (line: string) => void }): Promise<void>;
    createContainer(spec: ContainerSpec): Promise<void>;
    startContainer(name: string): Promise<void>;
    stopContainer(name: string): Promise<void>;
    removeContainer(name: string): Promise<void>;
    listManagedContainers(): Promise<ContainerInfo[]>;
    inspectContainer(name: string): Promise<ContainerInfo | null>;
    streamLogs(name: string, opts: { tail: number; follow: boolean }, onLine: (line: string) => void): Promise<{ abort: () => void }>;
    removeVolume(name: string): Promise<void>;
    daemonReachable(): Promise<boolean>;
  }
  ```

- [ ] **Step 2: commit**

  Stage: `git add apps/cli/src/lib/orchestrator/types.ts`.

  Commit: `feat(cli): define Orchestrator interface`.

### Task 4.9: Implement `apps/cli/src/lib/orchestrator/mock.ts`

- [ ] **Step 1: implement**

  Create `apps/cli/src/lib/orchestrator/mock.ts` — in-memory state, used for unit tests of higher-level commands. Mirrors `Orchestrator` interface; tracks containers, images, volumes in `Map`s.

- [ ] **Step 2: write tests**

  Create `apps/cli/tests/orchestrator/mock.test.ts` — exercises every interface method, verifies state transitions.

- [ ] **Step 3: tests pass**

  Run: `pnpm --filter @zeno/cli test`. Expected: green.

- [ ] **Step 4: commit**

  Stage: `git add apps/cli/src/lib/orchestrator/mock.ts apps/cli/tests/orchestrator/mock.test.ts`.

  Commit: `feat(cli): add MockOrchestrator for unit tests`.

### Task 4.10: Implement `apps/cli/src/lib/orchestrator/docker.ts`

- [ ] **Step 1: write the smoke test (skipped if no Docker)**

  Create `apps/cli/tests/orchestrator/docker.smoke.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import Docker from 'dockerode';
  import { DockerOrchestrator } from '../../src/lib/orchestrator/docker.js';

  const docker = new Docker();
  const dockerAvailable = await docker.ping().then(() => true).catch(() => false);

  describe.skipIf(!dockerAvailable)('DockerOrchestrator integration', () => {
    it('creates, lists, removes a managed container', async () => {
      const orch = new DockerOrchestrator();
      // ... build a tiny spec using `alpine:latest` (or assume zeno-agent:dev exists)
      // create + list + remove + assert
    });
  });
  ```

- [ ] **Step 2: implement `DockerOrchestrator`**

  Create `apps/cli/src/lib/orchestrator/docker.ts`. Uses `dockerode` per Task 0.2 findings. Each method maps directly to the Docker Engine API call; container creation includes `Labels`, `HostConfig.PortBindings`, `HostConfig.Mounts` (named volumes + read-only binds), `HostConfig.RestartPolicy`. `streamLogs` returns an `{ abort }` so the `logs` command can clean up on `^C`.

- [ ] **Step 3: run tests**

  Run: `pnpm --filter @zeno/cli test`. Expected: pass for unit tests; smoke test passes if Docker is up, otherwise skipped.

- [ ] **Step 4: commit**

  Stage: `git add apps/cli/src/lib/orchestrator/docker.ts apps/cli/tests/orchestrator/docker.smoke.test.ts`.

  Commit: `feat(cli): implement DockerOrchestrator via dockerode`.

### Task 4.11: Add `apps/cli/src/lib/version.ts`

- [ ] **Step 1: write file**

  Create `apps/cli/src/lib/version.ts`:

  ```ts
  import { existsSync, readFileSync } from 'node:fs';
  import { join } from 'node:path';
  import { ZENO_HOME } from './paths.js';
  import type { DB } from '@zeno/db/host';
  import { queries } from '@zeno/db/host';

  export function readVersionFromPackage(): string {
    const pkg = join(ZENO_HOME, 'package.json');
    if (!existsSync(pkg)) return '0.0.0-dev';
    try {
      const json = JSON.parse(readFileSync(pkg, 'utf8')) as { version?: string };
      return json.version ?? '0.0.0-dev';
    } catch {
      return '0.0.0-dev';
    }
  }

  export function getCurrentVersion(db: DB): string {
    return queries.getVersion(db) ?? `v${readVersionFromPackage()}`;
  }
  ```

- [ ] **Step 2: commit**

  Stage: `git add apps/cli/src/lib/version.ts`.

  Commit: `feat(cli): add version resolver`.

### Task 4.12: Add `apps/cli/src/lib/upgrade.ts`

- [ ] **Step 1: write the failing test**

  Create `apps/cli/tests/lib/upgrade.test.ts`. Cover: `pickTarget` filtering with `--prerelease`, `--to`, `--edge`, default. Mock the release source via dependency injection — `listReleases` is passed as a fn parameter.

- [ ] **Step 2: implement**

  Create `apps/cli/src/lib/upgrade.ts`:
  - `Release` interface (`tag`, `prerelease`, `publishedAt`)
  - `listReleasesViaGh(): Promise<Release[]>` — spawns `gh release list ... --json ...`
  - `listReleasesViaRest(): Promise<Release[]>` — fetch GitHub REST
  - `listReleases(): Promise<Release[]>` — try gh first, fall back to REST, throw if both fail
  - `pickTarget(args, releases): string | { error }` — selection logic
  - `applyUpgrade(target): Promise<void>` — runs `git fetch --tags && git checkout <target>` (or `git checkout main && git pull --ff-only` for `edge`), then `pnpm install --frozen-lockfile && pnpm build --filter @zeno/cli && docker build -t zeno-agent:dev`. All steps via `child_process.spawn` with `stdio: 'inherit'`.

- [ ] **Step 3: tests pass**

  Run: `pnpm --filter @zeno/cli test`. Expected: green for unit tests (network calls mocked).

- [ ] **Step 4: commit**

  Stage: `git add apps/cli/src/lib/upgrade.ts apps/cli/tests/lib/upgrade.test.ts`.

  Commit: `feat(cli): add release resolver + upgrade applier`.

### Task 4.13: Rewrite `apps/cli/src/commands/profile-create.ts`

- [ ] **Step 1: replace file content**

  Citty `defineCommand` with positional `<profile>` and flags `--owner`, `--port`, `-y`. Run logic per spec ACs: validate name → resolve port (auto or explicit) → prompt for owner if not given and not `-y` → auto-detect timezone → generate master key → call `templates.materializeProfile(...)` → `queries.createProfile(...)` → `queries.appendAudit(...)` → print ok block with next steps.

- [ ] **Step 2: integration test (uses MockOrchestrator + tmp DB)**

  Create `apps/cli/tests/commands/profile-create.test.ts` — invoke the command's handler directly with mocked stdin (for prompt) and verify DB row + filesystem files appeared.

- [ ] **Step 3: tests pass**

  Run: `pnpm --filter @zeno/cli test`. Expected: green.

- [ ] **Step 4: commit**

  Stage: `git add apps/cli/src/commands/profile-create.ts apps/cli/tests/commands/profile-create.test.ts`.

  Commit: `feat(cli): rewrite profile create with prompt + templates + DB`.

### Task 4.14: Rewrite `apps/cli/src/commands/profile-list.ts`

- [ ] **Step 1: replace file content**

  Reads from DB, joins with `orchestrator.listManagedContainers()` for live status, prints the table per spec.

- [ ] **Step 2: commit**

  Commit: `feat(cli): rewrite profile list with DB + live container join`.

### Task 4.15: Rewrite `apps/cli/src/commands/profile-show.ts`

- [ ] **Step 1: replace file content**

  Output the full key/value detail block per spec AC (Port, Status, Created, Last started/stopped, Uptime, Dashboard URL, Container name, Image, Volumes, Mounts).

- [ ] **Step 2: commit**

  Commit: `feat(cli): rewrite profile show with full detail block`.

### Task 4.16: New command `apps/cli/src/commands/profile-edit.ts`

- [ ] **Step 1: implement**

  `defineCommand` with `<profile>` positional and `--port <N>` required. Validates new port, updates DB row, audits, prints `restart required` warning if running.

- [ ] **Step 2: commit**

  Commit: `feat(cli): add profile edit command`.

### Task 4.17: New command `apps/cli/src/commands/profile-delete.ts`

- [ ] **Step 1: implement**

  Confirms via typed name, then via orchestrator: `stopContainer` → `removeContainer` → `removeVolume(workspace)` → `removeVolume(claude-home)`. Then `rm -rf` profile dir, DB row delete, audit, clear sticky if matched.

- [ ] **Step 2: commit**

  Commit: `feat(cli): add profile delete command with confirm + cleanup`.

### Task 4.18: Rewrite `apps/cli/src/commands/profile-use.ts`

- [ ] **Step 1: replace file content**

  Calls `queries.setSticky(db, name)`, audits.

- [ ] **Step 2: commit**

  Commit: `feat(cli): rewrite profile use with DB sticky`.

### Task 4.19: Wire `apps/cli/src/commands/profile.ts`

- [ ] **Step 1: update subcommand registry**

  ```ts
  import { defineCommand } from 'citty';
  import create from './profile-create.js';
  import del from './profile-delete.js';
  import edit from './profile-edit.js';
  import list from './profile-list.js';
  import show from './profile-show.js';
  import use from './profile-use.js';

  export default defineCommand({
    meta: { name: 'profile', description: 'manage profiles (create, edit, delete, list, switch)' },
    subCommands: { create, list, show, edit, delete: del, use },
  });
  ```

- [ ] **Step 2: commit**

  Commit: `feat(cli): wire profile subcommand registry`.

### Task 4.20: Rewrite `apps/cli/src/commands/start.ts`

- [ ] **Step 1: replace file content**

  Resolves targets (sticky / arg / `--all`). For each: `orchestrator.imageExists('zeno-agent:dev')` — build if not (or if `--build`). Call `env-file.rewriteMasterKey(...)`. Build `ContainerSpec` (paths from `lib/paths.ts`). Call `orchestrator.createContainer(spec)` then `orchestrator.startContainer(name)`. Update DB status to `running`, set `lastStartedAt`. Audit. Print success block.

- [ ] **Step 2: commit**

  Commit: `feat(cli): rewrite start with imageInspect, env rewrite, dockerode create+start`.

### Task 4.21: Rewrite `apps/cli/src/commands/stop.ts`

- [ ] **Step 1: replace file content**

  `orchestrator.stopContainer(name)`, update DB, audit.

- [ ] **Step 2: commit**

  Commit: `feat(cli): rewrite stop via dockerode`.

### Task 4.22: Rewrite `apps/cli/src/commands/restart.ts`

- [ ] **Step 1: replace file content**

  Optional rebuild → stop → re-create with current spec (port may have changed) → start.

- [ ] **Step 2: commit**

  Commit: `feat(cli): rewrite restart with --build support`.

### Task 4.23: Rewrite `apps/cli/src/commands/logs.ts`

- [ ] **Step 1: replace file content**

  `orchestrator.streamLogs(name, { tail, follow: true }, line => process.stdout.write(line))`. Wire `SIGINT` to `abort()`.

- [ ] **Step 2: commit**

  Commit: `feat(cli): rewrite logs as dockerode streaming`.

### Task 4.24: Rewrite `apps/cli/src/commands/open.ts`

- [ ] **Step 1: replace file content**

  Resolve port from DB. Build URL. Pick opener:
  - `process.env.WSL_DISTRO_NAME` → `wslview`
  - `process.platform === 'darwin'` → `open`
  - else → `xdg-open`

  Spawn opener via `child_process.spawn`, propagate exit code.

- [ ] **Step 2: commit**

  Commit: `feat(cli): rewrite open with platform-aware opener`.

### Task 4.25: Add `apps/cli/src/commands/repo.ts`

- [ ] **Step 1: implement**

  ```ts
  import { defineCommand } from 'citty';

  export default defineCommand({
    meta: { name: 'repo', description: 'print the canonical repo path' },
    run() {
      console.log('~/.zeno/zeno-agent');
    },
  });
  ```

- [ ] **Step 2: commit**

  Commit: `feat(cli): add repo command`.

### Task 4.26: Rewrite `apps/cli/src/commands/doctor.ts`

- [ ] **Step 1: replace file content**

  Checks: docker daemon (`orchestrator.daemonReachable()`), `ZENO_HOME` exists, state DB opens, schema migrations applied (`COUNT(*) FROM schema_migrations`), running profiles count, sticky default, drift (`listManagedContainers` vs DB rows). Per-check ✓/✗. Exit 0 if all pass.

- [ ] **Step 2: commit**

  Commit: `feat(cli): rewrite doctor with DB + Docker drift checks`.

### Task 4.27: Add `apps/cli/src/commands/upgrade.ts`

- [ ] **Step 1: implement**

  `defineCommand` with `--list / --to / --prerelease / --edge`. Calls `lib/upgrade.ts` functions. With spinners for each phase (fetch tags, checkout, install, build CLI, build image). Updates `queries.setVersion(db, target)` and audits.

- [ ] **Step 2: commit**

  Commit: `feat(cli): add upgrade command with release picker + git checkout + rebuild`.

### Task 4.28: Delete legacy CLI commands and lib

- [ ] **Step 1: remove files**

  Run:
  ```
  git rm apps/cli/src/commands/docker.ts
  git rm apps/cli/src/commands/build.ts
  git rm apps/cli/src/commands/status.ts
  git rm apps/cli/src/commands/shell.ts
  git rm apps/cli/src/commands/update.ts
  git rm apps/cli/src/lib/compose.ts
  git rm apps/cli/src/lib/profile-list.ts
  git rm apps/cli/src/lib/context.ts
  ```

  If `apps/cli/src/lib/state.ts` was the JSON-state module, replace it with the DB-backed wrapper or delete it if commands now import directly from `@zeno/db/host`.

- [ ] **Step 2: typecheck**

  Run: `pnpm --filter @zeno/cli typecheck`. Expected: clean (any caller of removed modules has been refactored already in Tasks 4.13–4.27).

- [ ] **Step 3: commit**

  Commit: `chore(cli): remove legacy compose-based commands and helpers`.

### Task 4.29: Rewrite `apps/cli/src/index.ts`

- [ ] **Step 1: replace content**

  ```ts
  import { defineCommand, runMain } from 'citty';

  import doctor from './commands/doctor.js';
  import logs from './commands/logs.js';
  import open from './commands/open.js';
  import profile from './commands/profile.js';
  import repo from './commands/repo.js';
  import restart from './commands/restart.js';
  import start from './commands/start.js';
  import stop from './commands/stop.js';
  import upgrade from './commands/upgrade.js';
  import { readVersionFromPackage } from './lib/version.js';

  const main = defineCommand({
    meta: {
      name: 'zeno',
      version: readVersionFromPackage(),
      description: 'zeno multi-profile CLI',
    },
    subCommands: {
      profile,
      start,
      stop,
      restart,
      logs,
      open,
      doctor,
      upgrade,
      repo,
    },
  });

  runMain(main);
  ```

- [ ] **Step 2: commit**

  Commit: `feat(cli): wire new top-level command surface`.

### Task 4.30: Build + quality gate

- [ ] **Step 1: build**

  Run: `pnpm --filter @zeno/cli build`. Verify `apps/cli/dist/index.js` has the shebang.

- [ ] **Step 2: full quality gate**

  Run: `pnpm run quality-gate`. Expected: pass.

- [ ] **Step 3: commit any fixes**

  Commit lint fixes if biome made auto-changes: `chore(cli): biome auto-fix`.

---

## Phase 5 — install.sh + housekeeping

### Task 5.1: Rewrite `infra/install.sh`

- [ ] **Step 1: replace content**

  POSIX `sh`. Steps:
  1. Check prerequisites (`git`, `docker`, Node ≥ 24, pnpm ≥ 10) — exit non-zero with install URL if missing.
  2. Detect existing `~/.zeno/zeno-agent/` — exit non-zero with instruction to use `zeno upgrade` or remove the directory.
  3. Detect legacy `~/zeno-agent/` — print explicit instruction to back up and remove after this install.
  4. `mkdir -p ~/.zeno`.
  5. `git clone https://github.com/ribeirogab/zeno-agent ~/.zeno/zeno-agent`.
  6. `cd ~/.zeno/zeno-agent && pnpm install --frozen-lockfile && pnpm build --filter @zeno/cli`.
  7. `mkdir -p ~/.local/bin && ln -sf ~/.zeno/zeno-agent/apps/cli/dist/index.js ~/.local/bin/zeno`.
  8. PATH check; print export line if needed.
  9. Final message:
     ```
     ✓ Cloned to ~/.zeno/zeno-agent
     ✓ Installed CLI to ~/.local/bin/zeno

     Next:  zeno profile create <name>
            zeno start <name>

     Docs:  https://github.com/ribeirogab/zeno-agent#readme
     ```
  10. **Do not reference `ZENO_HOME` anywhere.**

- [ ] **Step 2: shellcheck**

  Run: `shellcheck -s sh infra/install.sh`. Expected: clean.

- [ ] **Step 3: commit**

  Commit: `feat(infra): rewrite install.sh for ~/.zeno/zeno-agent layout`.

### Task 5.2: Drop `docker:*` scripts from root `package.json`

- [ ] **Step 1: edit**

  Remove the `docker:build`, `docker:up`, `docker:down`, `docker:logs`, `docker:setup-token`, `docker:sh` entries from `scripts`.

- [ ] **Step 2: commit**

  Commit: `chore: remove docker:* scripts from root package.json`.

### Task 5.3: Delete legacy infra files

- [ ] **Step 1: delete**

  Run: `git rm infra/docker-compose.default.yml infra/docker-compose.fn.yml infra/docker.sh infra/migrate-claude-home.sh`.

- [ ] **Step 2: commit**

  Commit: `chore(infra): remove compose-per-profile files and helpers`.

### Task 5.4: Delete `apps/cli-next/`

- [ ] **Step 1: delete**

  Run: `git rm -r apps/cli-next/`. Also remove the `~/.local/bin/zeno-next` symlink manually (operator-side; not committed).

- [ ] **Step 2: commit**

  Commit: `chore: remove apps/cli-next prototype (superseded by apps/cli)`.

### Task 5.5: Update `README.md`

- [ ] **Step 1: edit**

  Replace install path (`~/zeno-agent` → `~/.zeno/zeno-agent`). Replace daily-ops table with the new CLI surface. Drop references to `docker:*` scripts. Drop references to `config.yaml`. Add a short "Multi-profile" subsection mentioning `zeno profile create/list/use`.

- [ ] **Step 2: commit**

  Commit: `docs(readme): update for multi-profile CLI install path and surface`.

### Task 5.6: Update `CLAUDE.md`

- [ ] **Step 1: edit**

  Replace the "Commands (most used)" table:
  - `pnpm run quality-gate` — unchanged.
  - `zeno start/stop/restart [name|--all] [--build]` — replaces the per-profile compose lifecycle.
  - `zeno profile create/list/show/edit/delete/use` — new.
  - `zeno logs [name]`, `zeno open [name]`, `zeno doctor`, `zeno upgrade [...]`, `zeno repo` — refreshed.
  - Drop `infra/docker.sh` and `pnpm run docker:*` mentions.

- [ ] **Step 2: commit**

  Commit: `docs(claude): update commands table for multi-profile CLI`.

### Task 5.7: Full quality gate

- [ ] **Step 1: run**

  Run: `pnpm run quality-gate`. Expected: pass everywhere.

---

## Phase 6 — Manual verification + ship

### Task 6.1: Clean-state install dry-run

- [ ] **Step 1: simulate clean machine**

  On a separate temporary path or in a Docker container, run the rewritten `install.sh` and verify the install completes, the symlink resolves, and `zeno --version` works.

- [ ] **Step 2: profile create + start round-trip**

  Run: `zeno profile create test --owner "Alice"`. Verify `~/.zeno/profiles/test/USER.md` and `.env` exist. Run `zeno start test`. Verify the container `zeno-test` is running. Open `http://localhost:6101` and confirm the dashboard loads.

- [ ] **Step 3: cleanup**

  Run: `zeno profile delete test`. Verify container, volumes, and dir are gone.

### Task 6.2: Update `.vault/_index/specs.md`

- [ ] **Step 1: add this spec to the index**

  Edit `.vault/_index/specs.md`. Add `[[../specs/2026-05-07-multi-profile-cli/spec|Multi-Profile CLI]]` under the active section.

- [ ] **Step 2: commit**

  Commit: `docs(vault): index multi-profile-cli spec`.

### Task 6.3: Update `ROADMAP.md`

- [ ] **Step 1: edit**

  Move this work into the **Now (in flight)** section as `#17 — feat(cli): multi-profile via CLI + kill config.yaml`. The follow-up onboarding wizard (depends on #17) gets its own issue when this ships.

- [ ] **Step 2: commit**

  Commit: `docs(roadmap): promote multi-profile-cli to in-flight`.

### Task 6.4: Open issue + PR

- [ ] **Step 1: issue already opened (#17)**

  Issue [`#17`](https://github.com/ribeirogab/zeno-agent/issues/17) was opened during the spec PR. No action here; reference it in the implementation PR.

- [ ] **Step 2: open PR**

  Run `/open-pr`. The PR title/description are auto-generated from the spec.

- [ ] **Step 3: ship**

  Once approved, merge. Move spec frontmatter `status: shipped` and set `shipped: <date>`. Run the after-completion reflection per `CLAUDE.md` ("After completing a spec" section).
