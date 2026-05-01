---
feature: skills-and-capability-defaults
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-28
---
# Skills and Capability Defaults — Tasks

**For this plan:** `[[plan]]`

> Each phase ends with a commit. After every phase, run `pnpm -w run quality-gate` (lint + typecheck + tests across all workspaces) — must pass before moving on. Commit messages in EN.

---

## Phase A — Storage layer (migrations 13 + 14, Skill type, repo extensions)

### Task A.1 — Migration 13: flip dev capabilities to enabled-by-default

- [ ] **A.1.1** Open `packages/storage/src/migrations.ts`. Append migration 13 to the `MIGRATIONS` array (after migration 12):
  ```ts
  {
    id: 13,
    name: 'spec 0053 — flip dev capabilities (Bash/Read/Edit/Write/Glob/Grep) to enabled-by-default. Aligns with the zeno-development default skill which Zeno ships with. Sensitive tools (Task/WebFetch/WebSearch) stay off; ToolSearch was already on per migration 12.',
    sql: `
  UPDATE agent_capabilities SET enabled = 1, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
   WHERE tool_name IN ('Bash','Read','Edit','Write','Glob','Grep');
  `,
  },
  ```

- [ ] **A.1.2** Update test `packages/storage/tests/migrations.test.ts` — find the existing assertion for the agent_capabilities seed state and add a new test (after the migration-12 ToolSearch test):
  ```ts
  it('migration 13 flips Bash/Read/Edit/Write/Glob/Grep to enabled=1', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const rows = db
      .prepare('SELECT tool_name, enabled FROM agent_capabilities WHERE enabled = 1 ORDER BY tool_name')
      .all() as Array<{ tool_name: string; enabled: number }>;
    expect(rows.map((r) => r.tool_name)).toEqual(['Bash','Edit','Glob','Grep','Read','ToolSearch','Write']);
    closeDatabase(db);
  });
  ```

- [ ] **A.1.3** Update `packages/storage/tests/db.test.ts` — bump migration count assertions from `12` to `13` (or `14` after Task A.2 lands; choose whichever order you do first and adjust on the next task).

- [ ] **A.1.4** Update `packages/storage/tests/agent-capabilities.test.ts` — fix the "all 10 seeded" test to expect 7 rows enabled (Bash/Edit/Glob/Grep/Read/ToolSearch/Write) and 3 disabled (Task/WebFetch/WebSearch).

- [ ] **A.1.5** Run storage tests: `pnpm --filter @zeno/storage test`. Expect: all green.

### Task A.2 — Migration 14: add `source` column to `skills`

- [ ] **A.2.1** Append migration 14 to `MIGRATIONS`:
  ```ts
  {
    id: 14,
    name: 'spec 0053 — add `source` column to skills (zeno_default | profile | dashboard). Default `dashboard` for existing rows so spec 0052 uploads stay consistent. CHECK constraint enforces the enum.',
    sql: `
  ALTER TABLE skills ADD COLUMN source TEXT;
  UPDATE skills SET source = 'dashboard' WHERE source IS NULL;
  -- SQLite cannot add a CHECK constraint to an existing column directly; recreate the table.
  CREATE TABLE skills_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    body TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('zeno_default','profile','dashboard')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  INSERT INTO skills_new (id, name, description, body, source, created_at, updated_at)
    SELECT id, name, description, body, source, created_at, updated_at FROM skills;
  DROP TABLE skills;
  ALTER TABLE skills_new RENAME TO skills;
  CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
  CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
  `,
  },
  ```

- [ ] **A.2.2** Update `packages/storage/src/types.ts`:
  ```ts
  export type SkillSource = 'zeno_default' | 'profile' | 'dashboard';

  export interface Skill {
    id: string;
    name: string;
    description: string;
    body: string;
    source: SkillSource;
    createdAt: string;
    updatedAt: string;
  }
  ```
  Also extend `CreateSkillInput` to accept optional `source?: SkillSource` (defaults to `'dashboard'` in repo).

- [ ] **A.2.3** Update `packages/storage/src/repos/skills.ts`:
  - `SkillRow` interface gains `source: string`.
  - `rowToSkill` returns the new field.
  - `create()` accepts `source` (defaults `'dashboard'`).
  - `list()` and `get()` SELECT `*` already, so they pick up `source` for free — verify the projection.
  - Add new method:
    ```ts
    upsertBySource(input: {
      name: string;
      description: string;
      body: string;
      source: SkillSource;
    }): Skill {
      const existing = this.db.prepare('SELECT id FROM skills WHERE name = ?').get(input.name) as { id: string } | undefined;
      if (existing) {
        this.db
          .prepare(`UPDATE skills SET description = ?, body = ?, source = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?`)
          .run(input.description, input.body, input.source, existing.id);
        const got = this.get(existing.id);
        if (!got) throw new Error(`skill ${input.name} disappeared during upsert`);
        return got;
      }
      const id = randomUUID();
      this.db
        .prepare(`INSERT INTO skills (id, name, description, body, source) VALUES (?, ?, ?, ?, ?)`)
        .run(id, input.name, input.description, input.body, input.source);
      const created = this.get(id);
      if (!created) throw new Error(`failed to read back skill ${id} after upsert insert`);
      return created;
    }

    deleteOrphans(source: SkillSource, allowedNames: string[]): { removed: string[]; cascadeAffected: number } {
      // Profile orphans are explicitly NOT deleted — only zeno_default.
      if (source !== 'zeno_default') return { removed: [], cascadeAffected: 0 };
      const placeholders = allowedNames.length ? allowedNames.map(() => '?').join(',') : '';
      const where = allowedNames.length
        ? `WHERE source = ? AND name NOT IN (${placeholders})`
        : `WHERE source = ?`;
      const params = allowedNames.length ? [source, ...allowedNames] : [source];
      const orphans = this.db.prepare(`SELECT id, name FROM skills ${where}`).all(...params) as Array<{ id: string; name: string }>;
      if (orphans.length === 0) return { removed: [], cascadeAffected: 0 };
      const cascadeRow = this.db
        .prepare(`SELECT COUNT(*) AS c FROM connector_skills WHERE skill_id IN (${orphans.map(() => '?').join(',')})`)
        .get(...orphans.map((o) => o.id)) as { c: number };
      const ids = orphans.map((o) => o.id);
      this.db.prepare(`DELETE FROM skills WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
      return { removed: orphans.map((o) => o.name), cascadeAffected: cascadeRow.c };
    }
    ```

- [ ] **A.2.4** Add a new test file `packages/storage/tests/skills-source.test.ts`:
  ```ts
  import { closeDatabase, openDatabase, runMigrations, SkillRepo } from '../src/index.js';
  import { describe, it, expect } from 'vitest';

  describe('SkillRepo source column (spec 0053)', () => {
    function setup() {
      const db = openDatabase(':memory:');
      runMigrations(db);
      return { db, repo: new SkillRepo(db), close: () => closeDatabase(db) };
    }

    it('create defaults to source=dashboard', () => {
      const { repo, close } = setup();
      const skill = repo.create({ name: 'a-skill', description: 'd', body: 'b' });
      expect(skill.source).toBe('dashboard');
      close();
    });

    it('upsertBySource inserts then updates the same row', () => {
      const { repo, close } = setup();
      const first = repo.upsertBySource({ name: 'x', description: 'd1', body: 'b1', source: 'zeno_default' });
      const second = repo.upsertBySource({ name: 'x', description: 'd2', body: 'b2', source: 'zeno_default' });
      expect(first.id).toBe(second.id);
      expect(second.description).toBe('d2');
      expect(second.body).toBe('b2');
      close();
    });

    it('deleteOrphans removes zeno_default rows whose name not in allowlist', () => {
      const { repo, close } = setup();
      repo.upsertBySource({ name: 'a', description: 'd', body: 'b', source: 'zeno_default' });
      repo.upsertBySource({ name: 'b', description: 'd', body: 'b', source: 'zeno_default' });
      repo.create({ name: 'c-dash', description: 'd', body: 'b' }); // dashboard, must NOT be deleted
      const result = repo.deleteOrphans('zeno_default', ['a']);
      expect(result.removed).toEqual(['b']);
      expect(repo.list().map((s) => s.name).sort()).toEqual(['a', 'c-dash']);
      close();
    });

    it('deleteOrphans is a no-op for source=profile (profile orphans are kept)', () => {
      const { repo, close } = setup();
      repo.upsertBySource({ name: 'p1', description: 'd', body: 'b', source: 'profile' });
      const result = repo.deleteOrphans('profile', []);
      expect(result.removed).toEqual([]);
      expect(repo.list()).toHaveLength(1);
      close();
    });

    it('migration 14 backfills existing rows to source=dashboard', () => {
      const { repo, close } = setup();
      repo.create({ name: 'pre-existing', description: 'd', body: 'b' });
      const skill = repo.list()[0];
      if (!skill) throw new Error('row missing');
      expect(skill.source).toBe('dashboard');
      close();
    });
  });
  ```

- [ ] **A.2.5** Update `packages/storage/tests/migrations.test.ts` — bump db.test.ts migrations expected to `[1..14]`, current to `14`. Add a test that asserts the `source` CHECK constraint rejects invalid values (e.g. `INSERT ... source='other'` throws).

- [ ] **A.2.6** Run storage tests: `pnpm --filter @zeno/storage test` — expect green.

### Task A.3 — Commit Phase A

- [ ] **A.3.1** Commit Phase A:
  ```
  git add packages/storage/
  git commit -m "feat(storage): migrations 13+14 — dev caps default-on + skills.source column (spec 0053 phase A)"
  ```

- [ ] **A.3.2** Run full quality gate: `pnpm -w run quality-gate`. Expect: 30/30. If anything is red, fix before moving to Phase B.

---

## Phase B — Worker boot seeder

### Task B.1 — `bootSkillsReconcile()` implementation

- [ ] **B.1.1** Create `apps/worker/src/skills/seed.ts`:
  ```ts
  import { readdirSync, readFileSync, statSync } from 'node:fs';
  import { join } from 'node:path';
  import { parse as parseYaml } from 'yaml';
  import type { Logger } from '@zeno/logger';
  import type { SkillRepo, SkillSource } from '@zeno/storage';

  /**
   * Spec 0053 — boot-time skill reconciliation. Reads file trees that ship
   * with the binary (`agent/skills/`) or with the active profile
   * (`profiles/<name>/skills/`) and seeds the DB.
   *
   * Semantics:
   * - `zeno_default` (agent/skills/): UPSERT each file's contents on every boot
   *   (file is canonical) + delete rows whose file disappeared.
   * - `profile` (profiles/<name>/skills/): INSERT OR IGNORE only (file is the
   *   first-boot seed; after that the dashboard is authoritative). Orphans NOT
   *   deleted.
   *
   * Runs before the materializer; the materializer then writes whatever ended
   * up in the DB to `~/.claude/skills/`.
   */
  export interface SeedReport {
    zenoDefault: number;
    profile: number;
    orphansRemoved: string[];
    cascadeAffected: number;
  }

  interface ParsedSkill {
    name: string;
    description: string;
    body: string;
  }

  function readSkillFile(filePath: string): ParsedSkill | null {
    const raw = readFileSync(filePath, 'utf-8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match || !match[1] || match[2] === undefined) return null;
    const front = parseYaml(match[1]) as { name?: unknown; description?: unknown };
    const body = match[2];
    if (typeof front.name !== 'string' || typeof front.description !== 'string') return null;
    return { name: front.name, description: front.description, body };
  }

  function listSkillDir(root: string): ParsedSkill[] {
    const out: ParsedSkill[] = [];
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      return out;
    }
    for (const entry of entries) {
      const path = join(root, entry);
      try {
        if (!statSync(path).isDirectory()) continue;
      } catch {
        continue;
      }
      const skillFile = join(path, 'SKILL.md');
      try {
        statSync(skillFile);
      } catch {
        continue;
      }
      const parsed = readSkillFile(skillFile);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  export function bootSkillsReconcile(opts: {
    skills: SkillRepo;
    agentSkillsRoot: string;
    profileSkillsRoot: string | null;
    logger: Logger;
  }): SeedReport {
    const zenoFiles = listSkillDir(opts.agentSkillsRoot);
    for (const file of zenoFiles) {
      opts.skills.upsertBySource({ ...file, source: 'zeno_default' });
    }

    const profileFiles = opts.profileSkillsRoot ? listSkillDir(opts.profileSkillsRoot) : [];
    let profileSeeded = 0;
    for (const file of profileFiles) {
      // INSERT OR IGNORE semantics: only insert if no row with this name exists.
      const existing = opts.skills.getByName?.(file.name) ?? null;
      if (!existing) {
        opts.skills.create({ ...file, source: 'profile' });
        profileSeeded++;
      }
    }

    const orphan = opts.skills.deleteOrphans('zeno_default', zenoFiles.map((f) => f.name));

    const report: SeedReport = {
      zenoDefault: zenoFiles.length,
      profile: profileSeeded,
      orphansRemoved: orphan.removed,
      cascadeAffected: orphan.cascadeAffected,
    };

    opts.logger.info(
      {
        event: 'skills_seeded',
        zenoDefault: report.zenoDefault,
        profile: report.profile,
        orphansRemoved: report.orphansRemoved.length,
      },
      `seeded ${report.zenoDefault} default + ${report.profile} profile skill(s)`,
    );

    if (orphan.removed.length > 0) {
      opts.logger.info(
        {
          event: 'skills_orphan_cleanup_complete',
          removed: orphan.removed,
          cascadeAffected: orphan.cascadeAffected,
        },
        `removed ${orphan.removed.length} orphan zeno_default skill(s); cascade affected ${orphan.cascadeAffected} connector_skills row(s)`,
      );
    }

    return report;
  }
  ```

  Note: this calls `skills.getByName(name)` which doesn't exist yet. Add it in `SkillRepo`:
  ```ts
  getByName(name: string): Skill | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as SkillRow | undefined;
    return row ? rowToSkill(row) : null;
  }
  ```

- [ ] **B.1.2** Add `apps/api/package.json`'s dep on `yaml` to `apps/worker/package.json` if not already there:
  ```bash
  cd apps/worker && pnpm add yaml
  ```
  (If already present, skip.)

- [ ] **B.1.3** Create unit test `apps/worker/tests/skills/seed.test.ts`:
  ```ts
  import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { closeDatabase, openDatabase, runMigrations, SkillRepo } from '@zeno/storage';
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import { bootSkillsReconcile } from '@/skills/seed';

  function mkSkill(root: string, name: string, description: string, body: string) {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`);
  }

  describe('bootSkillsReconcile (spec 0053)', () => {
    let tmp: string;
    let agentRoot: string;
    let profileRoot: string;
    let db: ReturnType<typeof openDatabase>;
    let skills: SkillRepo;
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() } as never;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'seed-'));
      agentRoot = join(tmp, 'agent', 'skills');
      profileRoot = join(tmp, 'profile', 'skills');
      mkdirSync(agentRoot, { recursive: true });
      mkdirSync(profileRoot, { recursive: true });
      db = openDatabase(':memory:');
      runMigrations(db);
      skills = new SkillRepo(db);
    });

    afterEach(() => {
      closeDatabase(db);
      rmSync(tmp, { recursive: true, force: true });
    });

    it('seeds zeno_default UPSERT and profile INSERT OR IGNORE', () => {
      mkSkill(agentRoot, 'zeno-development', 'workflow', '# Workflow');
      mkSkill(profileRoot, 'fn-code-review', 'review', '# Review');
      const report = bootSkillsReconcile({ skills, agentSkillsRoot: agentRoot, profileSkillsRoot: profileRoot, logger });
      expect(report).toEqual({ zenoDefault: 1, profile: 1, orphansRemoved: [], cascadeAffected: 0 });
      expect(skills.list()).toHaveLength(2);
      const dev = skills.list().find((s) => s.name === 'zeno-development');
      const cr = skills.list().find((s) => s.name === 'fn-code-review');
      expect(dev?.source).toBe('zeno_default');
      expect(cr?.source).toBe('profile');
    });

    it('zeno_default UPSERT updates body when file changes', () => {
      mkSkill(agentRoot, 'zeno-development', 'd', 'first');
      bootSkillsReconcile({ skills, agentSkillsRoot: agentRoot, profileSkillsRoot: null, logger });
      writeFileSync(join(agentRoot, 'zeno-development', 'SKILL.md'), `---\nname: zeno-development\ndescription: d\n---\nsecond\n`);
      bootSkillsReconcile({ skills, agentSkillsRoot: agentRoot, profileSkillsRoot: null, logger });
      const updated = skills.list().find((s) => s.name === 'zeno-development');
      expect(updated?.body.trim()).toBe('second');
    });

    it('profile INSERT OR IGNORE preserves user edits across boots', () => {
      mkSkill(profileRoot, 'fn-x', 'd', 'seeded');
      bootSkillsReconcile({ skills, agentSkillsRoot: agentRoot, profileSkillsRoot: profileRoot, logger });
      const seeded = skills.list().find((s) => s.name === 'fn-x');
      if (!seeded) throw new Error('not seeded');
      // Simulate a dashboard edit that bumps the body.
      skills.update(seeded.id, { body: 'edited-by-user' });
      bootSkillsReconcile({ skills, agentSkillsRoot: agentRoot, profileSkillsRoot: profileRoot, logger });
      const after = skills.list().find((s) => s.name === 'fn-x');
      expect(after?.body).toBe('edited-by-user');
    });

    it('orphan cleanup deletes zeno_default rows when file disappears', () => {
      mkSkill(agentRoot, 'zeno-a', 'd', 'b');
      mkSkill(agentRoot, 'zeno-b', 'd', 'b');
      bootSkillsReconcile({ skills, agentSkillsRoot: agentRoot, profileSkillsRoot: null, logger });
      rmSync(join(agentRoot, 'zeno-b'), { recursive: true });
      const report = bootSkillsReconcile({ skills, agentSkillsRoot: agentRoot, profileSkillsRoot: null, logger });
      expect(report.orphansRemoved).toEqual(['zeno-b']);
      expect(skills.list().map((s) => s.name)).toEqual(['zeno-a']);
    });

    it('orphan cleanup does NOT delete profile rows when file disappears', () => {
      mkSkill(profileRoot, 'fn-x', 'd', 'b');
      bootSkillsReconcile({ skills, agentSkillsRoot: agentRoot, profileSkillsRoot: profileRoot, logger });
      rmSync(join(profileRoot, 'fn-x'), { recursive: true });
      const report = bootSkillsReconcile({ skills, agentSkillsRoot: agentRoot, profileSkillsRoot: profileRoot, logger });
      expect(report.orphansRemoved).toEqual([]);
      expect(skills.list().map((s) => s.name)).toEqual(['fn-x']);
    });

    it('orphan cleanup logs the audit event with names + cascadeAffected', () => {
      mkSkill(agentRoot, 'zeno-a', 'd', 'b');
      bootSkillsReconcile({ skills, agentSkillsRoot: agentRoot, profileSkillsRoot: null, logger });
      rmSync(join(agentRoot, 'zeno-a'), { recursive: true });
      logger.info.mockClear();
      bootSkillsReconcile({ skills, agentSkillsRoot: agentRoot, profileSkillsRoot: null, logger });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'skills_orphan_cleanup_complete', removed: ['zeno-a'] }),
        expect.any(String),
      );
    });
  });
  ```

- [ ] **B.1.4** Run worker tests for the seeder: `pnpm --filter @zeno/worker exec vitest run tests/skills/seed.test.ts`. Expect: 6/6 green.

### Task B.2 — Wire seeder into worker boot

- [ ] **B.2.1** Open `apps/worker/src/index.ts`. Find the place where `materializeSkillsToFs(...)` is called. Just before that call, invoke:
  ```ts
  bootSkillsReconcile({
    skills,
    agentSkillsRoot: resolve(process.cwd(), 'agent/skills'),
    profileSkillsRoot: resolve(process.cwd(), config.profileDir, 'skills'),
    logger,
  });
  ```
  Import `bootSkillsReconcile` from `@/skills/seed`. Use `node:path`'s `resolve`.

- [ ] **B.2.2** Run worker tests: `pnpm --filter @zeno/worker test`. Expect green.

### Task B.3 — Commit Phase B

- [ ] **B.3.1** Commit:
  ```
  git add apps/worker/ packages/storage/
  git commit -m "feat(worker): bootSkillsReconcile — seed agent/skills + profiles/<p>/skills (spec 0053 phase B)"
  ```

- [ ] **B.3.2** Run quality gate: `pnpm -w run quality-gate`. Expect 30/30 green.

---

## Phase C — API source field + immutability lock

### Task C.1 — Include `source` in API responses + reject mutations on `zeno_default`

- [ ] **C.1.1** Open `apps/api/src/routes/skills.ts`. Find the list endpoint projection (the route that returns the `skill` array stripped of `body`). Add `source` to the projection and the type. Same for the detail endpoint.

- [ ] **C.1.2** In the same file, locate the PATCH handler. Before doing the update, fetch the skill and check its `source`. If `source === 'zeno_default'`, return:
  ```ts
  return c.json({ error: 'zeno_default_immutable', message: 'this skill is managed by Zeno and cannot be edited' }, 403);
  ```
  Same for the DELETE handler.

- [ ] **C.1.3** Add tests in `apps/api/tests/routes/skills.test.ts`:
  - GET list → response items contain `source`.
  - GET detail → response includes `source`.
  - PATCH on a `zeno_default` skill → 403 with `error: 'zeno_default_immutable'`.
  - DELETE on a `zeno_default` skill → 403 with `error: 'zeno_default_immutable'`.
  - PATCH on a `profile` skill → 200 (still allowed).
  - PATCH on a `dashboard` skill → 200 (still allowed).

- [ ] **C.1.4** Run API tests: `pnpm --filter @zeno/api test`. Expect green.

### Task C.2 — Commit Phase C

- [ ] **C.2.1** Commit:
  ```
  git add apps/api/
  git commit -m "feat(api): include skill.source + 403 on PATCH/DELETE for zeno_default (spec 0053 phase C)"
  ```

- [ ] **C.2.2** Quality gate.

---

## Phase D — `zeno-development` SKILL.md content

### Task D.1 — Author the default skill

- [ ] **D.1.1** Create `agent/skills/zeno-development/SKILL.md`. Use `tmp/profile-fn-backup-2026-04-27/skills/dev-workflow/SKILL.md` as the basis but:
  - Generalize: remove FN-specific content (no FN orgs, no `ACME_GH_TOKEN`, no `acme` refs). The default skill must work in any profile. Profile-specific GitHub auth lives in profile skills (e.g. `fn-code-review` is the place for FN tokens).
  - Set `name: zeno-development`.
  - Tune the description so SDK auto-discovery fires on dev intents:
    > "Clone repos using bare clones + git worktrees, develop changes, deliver via Pull Requests. Use this skill whenever the user asks you to clone, code, fix, edit, refactor, implement, or open a PR on any repository."
  - Body sections: directory convention, first clone, reading project docs, starting a new task, quality gate, working in worktree, commit rules, push + PR, cleanup, edge cases, important reminders. Keep generic; mention the runtime expects a `github-app-*` connector to be installed for `gh`/`git push` to authenticate.

- [ ] **D.1.2** Verify the parser accepts it (frontmatter validates kebab-case `name` + `description`):
  ```bash
  node -e "const fs = require('fs'); const m = fs.readFileSync('agent/skills/zeno-development/SKILL.md','utf-8').match(/^---\n([\s\S]*?)\n---/); console.log(require('yaml').parse(m[1]))"
  ```
  Expect: `{ name: 'zeno-development', description: '...' }`.

### Task D.2 — Commit Phase D

- [ ] **D.2.1** Commit:
  ```
  git add agent/skills/zeno-development/
  git commit -m "feat(agent): zeno-development default skill — generic dev workflow (spec 0053 phase D)"
  ```

---

## Phase E — `fn-code-review` profile skill content

### Task E.1 — Author the profile skill

- [ ] **E.1.1** Create `profiles/fn/skills/fn-code-review/SKILL.md`. Copy content from `tmp/profile-fn-backup-2026-04-27/skills/code-review/SKILL.md` essentially as-is — that's already FN-specific (matches `profile` source semantics).

- [ ] **E.1.2** Verify name is `fn-code-review` and description is tuned for PR review intent. The original description already mentions "Review pull requests on GitHub following FN's git workflow" — keep that.

- [ ] **E.1.3** Adjust the description if needed to also cover the `@-mention with PR URLs` channel pattern from the screenshot in the user's request.

### Task E.2 — Commit Phase E

- [ ] **E.2.1** Commit:
  ```
  git add profiles/fn/skills/
  git commit -m "feat(profile/fn): fn-code-review skill (spec 0053 phase E)"
  ```

---

## Phase F — Playwright catalog connector + Chrome in Dockerfile

### Task F.1 — Catalog entry

- [ ] **F.1.1** Open `agent/connectors-catalog.json`. Add a new entry under `mcpServers` (or wherever the catalog convention is — peek at existing entries like `sentry` or `linear` first). Shape:
  ```json
  {
    "id": "playwright",
    "displayName": "Playwright",
    "description": "Browser automation — navigate, snapshot, click, fill, evaluate JavaScript on pages.",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@playwright/mcp@latest"],
    "iconUrl": null,
    "secrets": [],
    "tools": [
      { "toolName": "browser_navigate", "description": "Navigate to a URL", "category": "read", "permission": "ask" },
      { "toolName": "browser_snapshot", "description": "Snapshot the current page DOM", "category": "read", "permission": "ask" },
      { "toolName": "browser_click", "description": "Click an element", "category": "interactive", "permission": "ask" },
      { "toolName": "browser_fill", "description": "Fill an input", "category": "interactive", "permission": "ask" },
      { "toolName": "browser_evaluate", "description": "Run JS in the page", "category": "interactive", "permission": "ask" }
    ]
  }
  ```
  Adjust the tool list to match what `@playwright/mcp` actually exports (run `npx -y @playwright/mcp@latest --help` if unsure).

### Task F.2 — Install Chrome in the runtime stage

- [ ] **F.2.1** Open `infra/Dockerfile`. Find the runtime stage. After the deps install step, add:
  ```dockerfile
  # Spec 0053: Playwright is now a catalog connector. Install Chrome at build
  # time so the first navigation does not need to download the browser.
  RUN npx -y playwright install chrome --with-deps
  ```

- [ ] **F.2.2** Build the image: `pnpm -w run docker:build`. Expect: clean build, image size ~+300MB.

### Task F.3 — Commit Phase F

- [ ] **F.3.1** Commit:
  ```
  git add agent/connectors-catalog.json infra/Dockerfile
  git commit -m "feat(catalog): playwright + chrome at build time (spec 0053 phase F)"
  ```

---

## Phase G — Skill detail navigation bug fix

### Task G.1 — Investigate

- [ ] **G.1.1** Run `git status` and check whether `apps/dashboard/src/route-tree.gen.ts` exists in the repo and is current. If gitignored, generate it: `pnpm --filter @zeno/dashboard run build` (this triggers TanStackRouterVite plugin to regenerate the file).

- [ ] **G.1.2** If the route tree IS in the repo and current: open `apps/dashboard/src/routes/_authed/skills.$id.tsx` and inspect for runtime errors. Likely candidates: `useSkill(id)` call returns an error not handled, the auth guard, or a missing `<Outlet />` somewhere up the tree.

- [ ] **G.1.3** Run the dashboard dev mode locally (or in the container) and hard-load `/skills/<id>`. Check the browser console for errors.

### Task G.2 — Fix

- [ ] **G.2.1** Apply the fix that the investigation surfaced (one of: regenerate route tree, fix component throw, fix auth guard).

- [ ] **G.2.2** Verify the route renders detail content when navigated to from `/skills`.

### Task G.3 — Commit Phase G

- [ ] **G.3.1** Commit:
  ```
  git add apps/dashboard/
  git commit -m "fix(dashboard): /skills/:id route now renders detail (spec 0053 phase G)"
  ```

---

## Phase H — Dashboard badges + hide actions for `zeno_default`

### Task H.1 — Type propagation

- [ ] **H.1.1** Update `apps/dashboard/src/lib/use-skills.ts`. The `SkillListItem` and `SkillDetail` types gain `source: 'zeno_default' | 'profile' | 'dashboard'`. Also export the type as `SkillSource` for use in components.

### Task H.2 — Badges in list

- [ ] **H.2.1** Open `apps/dashboard/src/routes/_authed/skills.tsx`. Locate the row component (`SkillRow` or inline `<Link>`). Where it renders the `linked` cell or just before it, render a small badge component:
  ```tsx
  <SourceBadge source={skill.source} />
  ```
  with rules: `source === 'zeno_default'` → badge `default · zeno` (gold-ish, with a small lock icon); `source === 'profile'` → badge `profile` (neutral); `source === 'dashboard'` → no badge.

### Task H.3 — Detail screen badge + hide actions

- [ ] **H.3.1** Open `apps/dashboard/src/routes/_authed/skills.$id.tsx`. In the header where edit/delete buttons render, conditionally hide them when `skill.source === 'zeno_default'` and show a "managed by Zeno · cannot be edited" notice instead.

### Task H.4 — Defense-in-depth modal guards

- [ ] **H.4.1** Open `apps/dashboard/src/components/skills/edit-skill-modal.tsx`. Early return null if invoked on a `zeno_default` skill (the page should already not show the button, but defense in depth). Same for `delete-skill-modal.tsx`.

### Task H.5 — Commit Phase H

- [ ] **H.5.1** Commit:
  ```
  git add apps/dashboard/
  git commit -m "feat(dashboard): source badge + hide actions on zeno_default (spec 0053 phase H)"
  ```

---

## Phase I — Quality gate + Docker boot test

### Task I.1 — Quality gate

- [ ] **I.1.1** `pnpm -w run quality-gate`. Must pass 30/30. If not, fix and re-run.

### Task I.2 — Docker boot

- [ ] **I.2.1** `PROFILE=fn pnpm -w run docker:build`. Expect clean.

- [ ] **I.2.2** `PROFILE=fn pnpm -w run docker:up`. Wait for health.

- [ ] **I.2.3** `docker logs zeno-fn-agent-1 | grep -E "skills_seeded|agent_capabilities_loaded|skills_orphan_cleanup_complete|migrations_applied"`. Expect:
  - `migrations_applied`
  - `skills_seeded { zenoDefault: 1, profile: 1, ... }` (1 from `zeno-development`, 1 from `fn-code-review`)
  - `agent_capabilities_loaded enabled=[Bash,Edit,Glob,Grep,Read,ToolSearch,Write]`
  - No errors.

- [ ] **I.2.4** `docker exec zeno-fn-agent-1 ls /home/node/.claude/skills/`. Expect `zeno-development/` and `fn-code-review/` materialized.

- [ ] **I.2.5** Hit the dashboard at `http://localhost:3001/skills`. Expect both skills in the list with the right badges. Click `zeno-development` → URL changes AND detail renders, no edit/delete buttons. Click `fn-code-review` → URL changes AND detail renders, edit/delete buttons present.

- [ ] **I.2.6** Hit `http://localhost:3001/settings`. Expect Bash/Edit/Glob/Grep/Read/ToolSearch/Write toggled ON, Task/WebFetch/WebSearch toggled OFF.

- [ ] **I.2.7** Install `Playwright` connector via the catalog UI. Expect: connector appears in `/connectors`, all tools `permission='ask'` by default.

---

## Phase J — E2E 10+ runs via Slack

### Task J.1 — Setup

- [ ] **J.1.1** Confirm a `github-app-*` connector is installed in the fn profile pointing at `AcmeBooks/ecommerce-frontend` (the user installed installations earlier). Expect `installations:[...]` non-empty in worker logs.

- [ ] **J.1.2** Create the test results doc skeleton at `tmp/spec-0053-test-results.md`:
  ```markdown
  # Spec 0053 — E2E test results

  Repo under test: `AcmeBooks/ecommerce-frontend` (PRs opened as DRAFT, prefix `[zeno-test]`, base `main`, never merged).

  | # | Trigger | Implementation | Expected | Observed | Pass |
  |---|---|---|---|---|---|
  ```

### Task J.2 — Generate clean PRs via `zeno-development`

- [ ] **J.2.1** DM Zeno via Slack: `clone https://github.com/AcmeBooks/ecommerce-frontend e adiciona um arquivo NOTES.md no root com o conteúdo "smoke test #1". Abre PR em draft com prefix [zeno-test].`
- [ ] **J.2.2** Wait for the PR URL in Slack reply. Capture URL.

- [ ] **J.2.3** Repeat with a different small change for PR #2 (e.g. add a comment to README, fix a typo, add `// TODO` somewhere harmless).

### Task J.3 — Run the 10+ scenarios

For each scenario below, dispatch a fresh subagent via the `general-purpose` agent type to perform the whole flow (per Rule 1: "Subagents recebem briefing do objetivo do Zeno"). Subagent: open the bad/good PR (manually, using `gh` from a worktree if "bad PR"; or reuse a Zeno-generated PR if "good"), then DM Zeno with the right trigger, then read the GitHub review + Slack thread reply, then close the PR + delete the branch.

The subagent fills the row in `tmp/spec-0053-test-results.md` and reports the outcome to me.

| # | Trigger | Implementation | Expected outcome |
|---|---|---|---|
| 1 | "@zeno usa fn-code-review e revisa <pr>" (explicit) | clean PR from J.2.1 | approve |
| 2 | "@zeno revisa <pr>" (implicit auto-discovery) | clean PR from J.2.3 | approve |
| 3 | "@zeno revisa <pr>" | PR with logic bug + console.log left in | request-changes |
| 4 | "@zeno revisa <pr>" | clean PR with minor style nit | approve with nitpick |
| 5 | "@zeno revisa <pr>" | clean PR with optional refactor opportunity | approve with suggestion |
| 6 | "@zeno revisa <pr>" | UI change without screenshot | request-changes (per skill rule §2) |
| 7 | "@zeno revisa <pr>" | Biome convention violation (single-letter var, missing trailing comma) | request-changes |
| 8 | "@zeno revisa <pr>" | adds an unnecessary npm dep | approve with question |
| 9 | "@zeno revisa <pr>" | new feature without tests | request-changes |
| 10 | "@zeno revisa <pr>" | mixes 3 unrelated features | request-changes (split) |
| 11+ | (creative — bot review of bot's own clean PR; mention zeno without PR; very large diff; thread re-review after fix; …) | as above | as above |

- [ ] **J.3.1** Run scenarios 1–10 sequentially, dispatching a subagent per scenario to keep my main context clean. Each subagent:
  1. Receives a briefing of the scenario + Zeno's purpose.
  2. Opens (or reuses) the appropriate PR with the targeted defect, draft mode, `[zeno-test]` prefix.
  3. DMs Zeno from Slack with the trigger phrase.
  4. Reads the GitHub review submitted by Zeno.
  5. Reads the Slack thread reply.
  6. Compares against expected outcome.
  7. Closes the PR + deletes the branch.
  8. Returns `pass | fail` + 2-line summary.

- [ ] **J.3.2** Add at least 2 creative scenarios beyond the table (#11, #12). Examples: very large diff (>1000 lines), `@zeno` in thread without PR URL ("sanity: should ignore"), thread re-review after the author "fixes" things.

- [ ] **J.3.3** Aggregate results into `tmp/spec-0053-test-results.md`. Post a one-line summary in the user's Slack DM with Zeno (or to me, depending on context).

### Task J.4 — Iterate if any test fails

- [ ] **J.4.1** If any scenario fails — Zeno doesn't pick up the skill, gives the wrong outcome, or breaks — adjust the skill description / body / runtime config and rerun the failing scenario. Reset the 3-clean-rounds counter.

---

## Phase K — Final review + push + PR

### Task K.1 — Final 3-round review on whole branch

- [ ] **K.1.1** Diff the branch against `feat/skills`: `git log --oneline feat/skills..HEAD` and `git diff --stat feat/skills..HEAD`. Sanity-check no out-of-scope files crept in.

- [ ] **K.1.2** Dispatch the `code-reviewer`-style review subagent on the branch diff. R1.

- [ ] **K.1.3** Apply fixes if any findings. Reset counter. Re-dispatch (R2). Repeat until 3 consecutive clean reviews.

### Task K.2 — Push + open stacked PR (REQUIRES EXPLICIT USER OK)

- [ ] **K.2.1** `git push -u origin feat/skills-defaults-and-prreview`.

- [ ] **K.2.2** Use the project's `/open-pr` flow with `base = feat/skills` (NOT `main`). PR draft until R1+R2+R3 pass + the user reviews the description.

- [ ] **K.2.3** Notify the user with the PR URL + a one-line summary of what landed. Do NOT mark ready / request review without an explicit OK.
