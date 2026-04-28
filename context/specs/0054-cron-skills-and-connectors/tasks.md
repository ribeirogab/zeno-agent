---
feature: cron-skills-and-connectors
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-28
---
# Cron ↔ Skills and Connectors — Tasks

**For this plan:** `[[plan]]`

> Each phase ends with a commit. After every phase, run `pnpm -w run quality-gate` (lint + typecheck + tests across all workspaces) — must pass before moving on. Commit messages in EN.
>
> Per Rule 2 of the cleanup contract: after thinking a subtask is done, review 3× and reset the counter on any finding. Per Rule 4: implement without asking permission for trivia; only stop for `git push` / `gh pr create`.

> **⚠️ Phase B Task B.2 + B.4 + B.5 superseded post-R2 review.** The shipped gate API is `runInCronContext(opts, fn)` driven by AsyncLocalStorage, NOT the `preInjectCronSkills` / `pendingCronSkillIds` instance-field pattern described in the original code blocks below. See `spec.md` lines 48 + 61 + 95 + 100 + 148 for the canonical mechanism, and `apps/worker/src/guardrails/connector-gated-backend.ts` + `apps/worker/src/cron/runner.ts` for the implementation. R2 caught two bugs in the original design (throwaway wrapper + cron_run_now race) that ALS + lazy hook ref fix together. Phases A, C, D, E, F, G, H below are unchanged.

---

## Phase A — Storage layer (migrations 16 + 17 + repos)

### Task A.1 — Migration 16: `cron_skills` table

- [ ] **A.1.1** Open `packages/storage/src/migrations.ts`. Append migration 16 to the `MIGRATIONS` array (after migration 15):
  ```ts
  {
    id: 16,
    name: 'spec 0054 — cron_skills M:N table. Operator declares at scheduling time which skills should be force-injected when a cron fires. FK CASCADE on both sides: deleting a cron drops its links; deleting a skill drops the links pointing at it. PK (cron_id, skill_id) prevents duplicates. The runner reads via list_for_cron and prepends linked skill bodies to the cron prompt as a [zeno_context] block.',
    sql: `
  CREATE TABLE cron_skills (
    cron_id TEXT NOT NULL REFERENCES crons(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (cron_id, skill_id)
  );
  CREATE INDEX idx_cron_skills_skill_id ON cron_skills(skill_id);
  `,
  },
  ```

- [ ] **A.1.2** Run storage tests to confirm pre-existing migration tests still pass (the new table is additive):
  ```bash
  pnpm --filter @zeno/storage test -- migrations.test.ts
  ```
  Expect: still green (the test file likely asserts a count of migrations or table existence — fix in Task A.5 if needed).

### Task A.2 — Migration 17: `cron_connectors` table

- [ ] **A.2.1** Append migration 17 to `MIGRATIONS`:
  ```ts
  {
    id: 17,
    name: 'spec 0054 — cron_connectors M:N table. Hint-mode link: the cron prompt receives the linked connector slugs as context (preferred set) but the connector-permission gate stays the single allow/deny authority (spec 0050 single-guardrail canon). Use of an unlinked connector is allowed by the gate but emits a `cron_used_unlinked_connector` audit log. FK CASCADE on both sides; PK (cron_id, connector_id).',
    sql: `
  CREATE TABLE cron_connectors (
    cron_id TEXT NOT NULL REFERENCES crons(id) ON DELETE CASCADE,
    connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (cron_id, connector_id)
  );
  CREATE INDEX idx_cron_connectors_connector_id ON cron_connectors(connector_id);
  `,
  },
  ```

### Task A.3 — Types

- [ ] **A.3.1** Open `packages/storage/src/types.ts`. After the existing `ConnectorSkillLink` interface (≈ line 323), add:
  ```ts
  export interface CronSkillLink {
    cronId: string;
    skillId: string;
    createdAt: string;
  }

  export interface CronConnectorLink {
    cronId: string;
    connectorId: string;
    createdAt: string;
  }
  ```

### Task A.4 — `CronSkillRepo`

- [ ] **A.4.1** Create `packages/storage/src/repos/cron-skills.ts`:
  ```ts
  import type { DB } from '../db.js';
  import type { CronSkillLink, Skill, SkillSource } from '../types.js';

  interface SkillRow {
    id: string;
    name: string;
    description: string;
    body: string;
    source: string;
    created_at: string;
    updated_at: string;
  }

  interface LinkRow {
    cron_id: string;
    skill_id: string;
    created_at: string;
  }

  function rowToSkill(row: SkillRow): Skill {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      body: row.body,
      source: row.source as SkillSource,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function rowToLink(row: LinkRow): CronSkillLink {
    return { cronId: row.cron_id, skillId: row.skill_id, createdAt: row.created_at };
  }

  /**
   * Spec 0054: M:N relationship between crons and skills. The cron runner
   * reads `listForCron` per fire to build the [zeno_context] block that gets
   * prepended to the cron prompt. INNER JOIN ensures a deleted-but-still-
   * referenced skill is silently skipped (FK CASCADE drops the row, but a
   * race window can exist mid-tick).
   */
  export class CronSkillRepo {
    constructor(private readonly db: DB) {}

    listForCron(cronId: string): Skill[] {
      const rows = this.db
        .prepare(
          `SELECT s.* FROM skills s
           INNER JOIN cron_skills cs ON cs.skill_id = s.id
           WHERE cs.cron_id = ?
           ORDER BY s.name ASC`,
        )
        .all(cronId) as SkillRow[];
      return rows.map(rowToSkill);
    }

    listForSkill(skillId: string): CronSkillLink[] {
      const rows = this.db
        .prepare(`SELECT * FROM cron_skills WHERE skill_id = ? ORDER BY cron_id ASC`)
        .all(skillId) as LinkRow[];
      return rows.map(rowToLink);
    }

    replaceForCron(cronId: string, skillIds: string[]): void {
      const txn = this.db.transaction(() => {
        this.db.prepare('DELETE FROM cron_skills WHERE cron_id = ?').run(cronId);
        const insert = this.db.prepare(
          `INSERT INTO cron_skills (cron_id, skill_id)
           SELECT ?, ? WHERE EXISTS (SELECT 1 FROM skills WHERE id = ?)`,
        );
        for (const skillId of skillIds) {
          insert.run(cronId, skillId, skillId);
        }
      });
      txn();
    }

    add(cronId: string, skillId: string): void {
      this.db
        .prepare(`INSERT OR IGNORE INTO cron_skills (cron_id, skill_id) VALUES (?, ?)`)
        .run(cronId, skillId);
    }

    remove(cronId: string, skillId: string): boolean {
      const result = this.db
        .prepare(`DELETE FROM cron_skills WHERE cron_id = ? AND skill_id = ?`)
        .run(cronId, skillId);
      return result.changes > 0;
    }
  }
  ```

### Task A.5 — `CronConnectorRepo`

- [ ] **A.5.1** Create `packages/storage/src/repos/cron-connectors.ts`. Same shape as `CronSkillRepo` but for connectors:
  ```ts
  import type { DB } from '../db.js';
  import type { Connector, CronConnectorLink } from '../types.js';

  interface ConnectorRow {
    id: string;
    slug: string;
    display_name: string;
    description: string | null;
    icon_url: string | null;
    source: string;
    catalog_id: string | null;
    transport: string;
    command: string | null;
    args: string | null;
    env: string | null;
    url: string | null;
    headers: string | null;
    status: string;
    last_error: string | null;
    last_tested_at: string | null;
    app_id: string | null;
    created_at: string;
    updated_at: string;
  }

  interface LinkRow {
    cron_id: string;
    connector_id: string;
    created_at: string;
  }

  function rowToConnector(row: ConnectorRow): Connector {
    return {
      id: row.id,
      slug: row.slug,
      displayName: row.display_name,
      description: row.description,
      iconUrl: row.icon_url,
      source: row.source as Connector['source'],
      catalogId: row.catalog_id,
      transport: row.transport as Connector['transport'],
      command: row.command,
      args: row.args ? (JSON.parse(row.args) as string[]) : null,
      env: row.env ? (JSON.parse(row.env) as Record<string, string>) : null,
      url: row.url,
      headers: row.headers ? (JSON.parse(row.headers) as Record<string, string>) : null,
      status: row.status as Connector['status'],
      lastError: row.last_error,
      lastTestedAt: row.last_tested_at,
      appId: row.app_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function rowToLink(row: LinkRow): CronConnectorLink {
    return {
      cronId: row.cron_id,
      connectorId: row.connector_id,
      createdAt: row.created_at,
    };
  }

  /**
   * Spec 0054: M:N relationship between crons and connectors. Hint-mode link:
   * the linked slug list is surfaced in the [zeno_context] block as preferred,
   * but the connector-permission gate (spec 0050) stays the single allow/deny
   * authority. Use of an unlinked connector emits an audit log; it is NOT
   * blocked by this link.
   */
  export class CronConnectorRepo {
    constructor(private readonly db: DB) {}

    listForCron(cronId: string): Connector[] {
      const rows = this.db
        .prepare(
          `SELECT c.* FROM connectors c
           INNER JOIN cron_connectors cc ON cc.connector_id = c.id
           WHERE cc.cron_id = ?
           ORDER BY c.slug ASC`,
        )
        .all(cronId) as ConnectorRow[];
      return rows.map(rowToConnector);
    }

    listForConnector(connectorId: string): CronConnectorLink[] {
      const rows = this.db
        .prepare(`SELECT * FROM cron_connectors WHERE connector_id = ? ORDER BY cron_id ASC`)
        .all(connectorId) as LinkRow[];
      return rows.map(rowToLink);
    }

    replaceForCron(cronId: string, connectorIds: string[]): void {
      const txn = this.db.transaction(() => {
        this.db.prepare('DELETE FROM cron_connectors WHERE cron_id = ?').run(cronId);
        const insert = this.db.prepare(
          `INSERT INTO cron_connectors (cron_id, connector_id)
           SELECT ?, ? WHERE EXISTS (SELECT 1 FROM connectors WHERE id = ?)`,
        );
        for (const connectorId of connectorIds) {
          insert.run(cronId, connectorId, connectorId);
        }
      });
      txn();
    }

    add(cronId: string, connectorId: string): void {
      this.db
        .prepare(`INSERT OR IGNORE INTO cron_connectors (cron_id, connector_id) VALUES (?, ?)`)
        .run(cronId, connectorId);
    }

    remove(cronId: string, connectorId: string): boolean {
      const result = this.db
        .prepare(`DELETE FROM cron_connectors WHERE cron_id = ? AND connector_id = ?`)
        .run(cronId, connectorId);
      return result.changes > 0;
    }
  }
  ```

  **NOTE:** Confirm `rowToConnector`'s field projection matches `repos/connectors.ts:rowToConnector` exactly — copy-paste from there if drift is detected. Test below verifies a roundtrip.

### Task A.6 — Re-export

- [ ] **A.6.1** Open `packages/storage/src/index.ts`. Add re-exports:
  ```ts
  export { CronSkillRepo } from './repos/cron-skills.js';
  export { CronConnectorRepo } from './repos/cron-connectors.js';
  ```
  Confirm `CronSkillLink` + `CronConnectorLink` types are exported via the existing `export * from './types.js'` (or the explicit list — match the existing pattern in this file).

### Task A.7 — Tests: `CronSkillRepo`

- [ ] **A.7.1** Create `packages/storage/tests/cron-skills.test.ts`. Mirror `connector-skills.test.ts` 1-for-1 (replace `connector` → `cron`, `connectors.create` → `crons.create`):
  ```ts
  import { beforeEach, describe, expect, it } from 'vitest';
  import { type DB, openDatabase } from '../src/db.js';
  import { runMigrations } from '../src/migrations.js';
  import { CronSkillRepo } from '../src/repos/cron-skills.js';
  import { CronRepo } from '../src/repos/crons.js';
  import { SkillRepo } from '../src/repos/skills.js';

  let db: DB;
  let crons: CronRepo;
  let skills: SkillRepo;
  let links: CronSkillRepo;

  beforeEach(() => {
    db = openDatabase(':memory:');
    runMigrations(db);
    crons = new CronRepo(db);
    skills = new SkillRepo(db);
    links = new CronSkillRepo(db);
  });

  function seedCron(name: string) {
    return crons.create({
      name,
      prompt: 'p',
      schedule: '0 9 * * *',
      source: 'chat',
    });
  }

  describe('CronSkillRepo', () => {
    it('listForCron returns linked skills sorted by name', () => {
      const cron = seedCron('daily-standup');
      const a = skills.create({ name: 'aws-debug', description: 'd', body: 'b' });
      const f = skills.create({ name: 'fn-code-review', description: 'd', body: 'b' });
      const z = skills.create({ name: 'zeta', description: 'd', body: 'b' });
      links.add(cron.id, z.id);
      links.add(cron.id, a.id);
      links.add(cron.id, f.id);
      const linked = links.listForCron(cron.id);
      expect(linked.map((x) => x.name)).toEqual(['aws-debug', 'fn-code-review', 'zeta']);
    });

    it('listForSkill returns crons linked to a skill', () => {
      const c1 = seedCron('cron-a');
      const c2 = seedCron('cron-b');
      const s = skills.create({ name: 'shared', description: 'd', body: 'b' });
      links.add(c1.id, s.id);
      links.add(c2.id, s.id);
      const all = links.listForSkill(s.id);
      expect(all).toHaveLength(2);
      expect(all.map((l) => l.cronId).sort()).toEqual([c1.id, c2.id].sort());
    });

    it('replaceForCron atomically replaces the link list', () => {
      const cron = seedCron('cron');
      const a = skills.create({ name: 'a', description: 'd', body: 'b' });
      const b = skills.create({ name: 'b', description: 'd', body: 'b' });
      const c = skills.create({ name: 'c', description: 'd', body: 'b' });
      links.replaceForCron(cron.id, [a.id, b.id]);
      expect(links.listForCron(cron.id).map((x) => x.name).sort()).toEqual(['a', 'b']);
      links.replaceForCron(cron.id, [b.id, c.id]);
      expect(links.listForCron(cron.id).map((x) => x.name).sort()).toEqual(['b', 'c']);
      links.replaceForCron(cron.id, []);
      expect(links.listForCron(cron.id)).toEqual([]);
    });

    it('replaceForCron silently skips skill ids that do not exist', () => {
      const cron = seedCron('cron');
      const real = skills.create({ name: 'r', description: 'd', body: 'b' });
      links.replaceForCron(cron.id, [real.id, 'fake-id']);
      expect(links.listForCron(cron.id)).toHaveLength(1);
    });

    it('cascade: deleting a cron removes its link rows', () => {
      const cron = seedCron('cron');
      const s = skills.create({ name: 's', description: 'd', body: 'b' });
      links.add(cron.id, s.id);
      expect(links.listForSkill(s.id)).toHaveLength(1);
      crons.delete(cron.id);
      expect(links.listForSkill(s.id)).toHaveLength(0);
    });

    it('cascade: deleting a skill removes its link rows', () => {
      const cron = seedCron('cron');
      const s = skills.create({ name: 's', description: 'd', body: 'b' });
      links.add(cron.id, s.id);
      expect(links.listForCron(cron.id)).toHaveLength(1);
      skills.delete(s.id);
      expect(links.listForCron(cron.id)).toHaveLength(0);
    });

    it('add is idempotent (INSERT OR IGNORE)', () => {
      const cron = seedCron('cron');
      const s = skills.create({ name: 's', description: 'd', body: 'b' });
      links.add(cron.id, s.id);
      links.add(cron.id, s.id);
      expect(links.listForCron(cron.id)).toHaveLength(1);
    });

    it('remove returns true on success, false on missing pair', () => {
      const cron = seedCron('cron');
      const s = skills.create({ name: 's', description: 'd', body: 'b' });
      links.add(cron.id, s.id);
      expect(links.remove(cron.id, s.id)).toBe(true);
      expect(links.remove(cron.id, s.id)).toBe(false);
    });
  });
  ```

- [ ] **A.7.2** Run: `pnpm --filter @zeno/storage test -- cron-skills.test.ts`. Expect: 8/8 green.

### Task A.8 — Tests: `CronConnectorRepo`

- [ ] **A.8.1** Create `packages/storage/tests/cron-connectors.test.ts`. Same shape as A.7 but for connectors:
  ```ts
  import { beforeEach, describe, expect, it } from 'vitest';
  import { type DB, openDatabase } from '../src/db.js';
  import { runMigrations } from '../src/migrations.js';
  import { ConnectorRepo } from '../src/repos/connectors.js';
  import { CronConnectorRepo } from '../src/repos/cron-connectors.js';
  import { CronRepo } from '../src/repos/crons.js';

  let db: DB;
  let crons: CronRepo;
  let connectors: ConnectorRepo;
  let links: CronConnectorRepo;

  beforeEach(() => {
    db = openDatabase(':memory:');
    runMigrations(db);
    crons = new CronRepo(db);
    connectors = new ConnectorRepo(db);
    links = new CronConnectorRepo(db);
  });

  function seedCron(name: string) {
    return crons.create({ name, prompt: 'p', schedule: '0 9 * * *', source: 'chat' });
  }
  function seedConnector(slug: string) {
    return connectors.create({
      slug,
      displayName: slug,
      source: 'catalog',
      catalogId: slug,
      transport: 'remote',
      url: 'https://x',
      tools: [],
      secrets: [],
    });
  }

  describe('CronConnectorRepo', () => {
    it('listForCron returns linked connectors sorted by slug', () => {
      const cron = seedCron('cron');
      const linear = seedConnector('linear');
      const sentry = seedConnector('sentry');
      const github = seedConnector('github');
      links.add(cron.id, linear.id);
      links.add(cron.id, sentry.id);
      links.add(cron.id, github.id);
      const linked = links.listForCron(cron.id);
      expect(linked.map((x) => x.slug)).toEqual(['github', 'linear', 'sentry']);
    });

    it('listForConnector returns crons linked to a connector', () => {
      const c1 = seedCron('cron-a');
      const c2 = seedCron('cron-b');
      const linear = seedConnector('linear');
      links.add(c1.id, linear.id);
      links.add(c2.id, linear.id);
      const all = links.listForConnector(linear.id);
      expect(all).toHaveLength(2);
      expect(all.map((l) => l.cronId).sort()).toEqual([c1.id, c2.id].sort());
    });

    it('replaceForCron atomically replaces the link list', () => {
      const cron = seedCron('cron');
      const a = seedConnector('a');
      const b = seedConnector('b');
      const c = seedConnector('c');
      links.replaceForCron(cron.id, [a.id, b.id]);
      expect(links.listForCron(cron.id).map((x) => x.slug).sort()).toEqual(['a', 'b']);
      links.replaceForCron(cron.id, [b.id, c.id]);
      expect(links.listForCron(cron.id).map((x) => x.slug).sort()).toEqual(['b', 'c']);
      links.replaceForCron(cron.id, []);
      expect(links.listForCron(cron.id)).toEqual([]);
    });

    it('replaceForCron silently skips connector ids that do not exist', () => {
      const cron = seedCron('cron');
      const real = seedConnector('real');
      links.replaceForCron(cron.id, [real.id, 'fake-id']);
      expect(links.listForCron(cron.id)).toHaveLength(1);
    });

    it('cascade: deleting a cron removes its link rows', () => {
      const cron = seedCron('cron');
      const c = seedConnector('c');
      links.add(cron.id, c.id);
      expect(links.listForConnector(c.id)).toHaveLength(1);
      crons.delete(cron.id);
      expect(links.listForConnector(c.id)).toHaveLength(0);
    });

    it('cascade: deleting a connector removes its link rows', () => {
      const cron = seedCron('cron');
      const c = seedConnector('c');
      links.add(cron.id, c.id);
      expect(links.listForCron(cron.id)).toHaveLength(1);
      connectors.delete(c.id);
      expect(links.listForCron(cron.id)).toHaveLength(0);
    });

    it('add is idempotent (INSERT OR IGNORE)', () => {
      const cron = seedCron('cron');
      const c = seedConnector('c');
      links.add(cron.id, c.id);
      links.add(cron.id, c.id);
      expect(links.listForCron(cron.id)).toHaveLength(1);
    });

    it('remove returns true on success, false on missing pair', () => {
      const cron = seedCron('cron');
      const c = seedConnector('c');
      links.add(cron.id, c.id);
      expect(links.remove(cron.id, c.id)).toBe(true);
      expect(links.remove(cron.id, c.id)).toBe(false);
    });
  });
  ```

- [ ] **A.8.2** Run: `pnpm --filter @zeno/storage test -- cron-connectors.test.ts`. Expect: 8/8 green.

### Task A.9 — Bump migration count tests

- [ ] **A.9.1** Open `packages/storage/tests/db.test.ts`. Find the assertion that checks `current` migration id (currently `15`). Bump to `17`. If there's an array assertion `[1..15]`, change to `[1..17]`.

- [ ] **A.9.2** Open `packages/storage/tests/migrations.test.ts`. Add two tests right after the existing migration-15 test:
  ```ts
  it('migration 16 creates cron_skills with FK CASCADE on both sides', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.exec('PRAGMA foreign_keys = ON;');
    const tableInfo = db.prepare("PRAGMA table_info(cron_skills)").all() as Array<{ name: string }>;
    expect(tableInfo.map((c) => c.name).sort()).toEqual(['created_at', 'cron_id', 'skill_id']);
    closeDatabase(db);
  });

  it('migration 17 creates cron_connectors with FK CASCADE on both sides', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.exec('PRAGMA foreign_keys = ON;');
    const tableInfo = db.prepare("PRAGMA table_info(cron_connectors)").all() as Array<{ name: string }>;
    expect(tableInfo.map((c) => c.name).sort()).toEqual(['connector_id', 'created_at', 'cron_id']);
    closeDatabase(db);
  });
  ```

- [ ] **A.9.3** Run all storage tests: `pnpm --filter @zeno/storage test`. Expect: green.

### Task A.10 — Commit Phase A

- [ ] **A.10.1** Commit:
  ```bash
  git add packages/storage/
  git commit -m "feat(storage): cron_skills + cron_connectors M:N (spec 0054 phase A)"
  ```

- [ ] **A.10.2** Quality gate: `pnpm -w run quality-gate`. Expect: green.

- [ ] **A.10.3** **R1/R2/R3 review** of Phase A. Diff (`git show HEAD`), trace migrations + repos + tests, look for: types not re-exported, missing tests, repo SQL using wrong table name, etc. Reset counter on any finding.

---

## Phase B — Worker (runner injection + gated-backend rewrite + cron-backend wrap)

### Task B.1 — `[zeno_context]` block builder (pure)

- [ ] **B.1.1** Create `apps/worker/src/cron/zeno-context-block.ts`:
  ```ts
  /**
   * Spec 0054: build the [zeno_context] block prepended to the cron prompt
   * when the cron has linked skills and/or linked connectors. Pure function;
   * no DB, no logging — caller passes the resolved Skill[] + slug[].
   *
   * Bytes-cap semantics: skill bodies are concatenated in name order. If the
   * concatenated total exceeds CAP_BYTES, the tail is dropped at a
   * skill-boundary. The dropped skills surface in `droppedSkills` so the
   * caller can emit `cron_skill_truncated`.
   *
   * Format:
   *   [zeno_context]
   *   linked_skills:
   *   ## name-1
   *
   *   <body-1>
   *
   *   ---
   *
   *   ## name-2
   *
   *   <body-2>
   *
   *   linked_connectors: <slug-a>, <slug-b>
   *   [/zeno_context]
   *
   *   <original prompt>
   *
   * When zero skills + zero connectors: returns `{ block: null, ... }` and
   * the caller skips prepending entirely (back-compat for unlinked crons).
   */
  export const ZENO_CONTEXT_CAP_BYTES = 20_480; // 20 KB total skill bodies

  export interface SkillForBlock {
    name: string;
    body: string;
  }

  export interface BuildBlockResult {
    block: string | null;
    requestedBytes: number;
    truncatedBytes: number;
    droppedSkills: string[];
  }

  export function buildZenoContextBlock(
    skills: SkillForBlock[],
    connectorSlugs: string[],
    capBytes = ZENO_CONTEXT_CAP_BYTES,
  ): BuildBlockResult {
    if (skills.length === 0 && connectorSlugs.length === 0) {
      return { block: null, requestedBytes: 0, truncatedBytes: 0, droppedSkills: [] };
    }

    let runningBytes = 0;
    const kept: SkillForBlock[] = [];
    const dropped: string[] = [];
    let requested = 0;

    for (const skill of skills) {
      const piece = `## ${skill.name}\n\n${skill.body}`;
      const size = Buffer.byteLength(piece, 'utf-8');
      requested += size;
      if (runningBytes + size <= capBytes) {
        kept.push(skill);
        runningBytes += size;
      } else {
        dropped.push(skill.name);
      }
    }

    const lines: string[] = ['[zeno_context]'];
    if (kept.length > 0) {
      lines.push('linked_skills:');
      lines.push(kept.map((s) => `## ${s.name}\n\n${s.body}`).join('\n\n---\n\n'));
    }
    if (connectorSlugs.length > 0) {
      lines.push(`linked_connectors: ${connectorSlugs.join(', ')}`);
    }
    lines.push('[/zeno_context]');

    return {
      block: lines.join('\n'),
      requestedBytes: requested,
      truncatedBytes: runningBytes,
      droppedSkills: dropped,
    };
  }
  ```

- [ ] **B.1.2** Create `apps/worker/tests/cron/zeno-context-block.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest';
  import { buildZenoContextBlock, ZENO_CONTEXT_CAP_BYTES } from '@/cron/zeno-context-block';

  describe('buildZenoContextBlock (spec 0054)', () => {
    it('returns null block when zero skills + zero connectors', () => {
      const r = buildZenoContextBlock([], []);
      expect(r.block).toBeNull();
      expect(r.droppedSkills).toEqual([]);
    });

    it('builds skills-only block', () => {
      const r = buildZenoContextBlock([{ name: 'a', body: 'A' }], []);
      expect(r.block).toContain('linked_skills:');
      expect(r.block).toContain('## a');
      expect(r.block).toContain('\nA');
      expect(r.block).not.toContain('linked_connectors:');
      expect(r.droppedSkills).toEqual([]);
    });

    it('builds connectors-only block', () => {
      const r = buildZenoContextBlock([], ['linear', 'sentry']);
      expect(r.block).toContain('linked_connectors: linear, sentry');
      expect(r.block).not.toContain('linked_skills:');
    });

    it('builds skills + connectors block', () => {
      const r = buildZenoContextBlock(
        [{ name: 'a', body: 'A' }, { name: 'b', body: 'B' }],
        ['linear'],
      );
      expect(r.block).toContain('linked_skills:');
      expect(r.block).toContain('linked_connectors: linear');
      expect(r.block).toContain('---');
    });

    it('truncates skills past the bytes cap', () => {
      const big = 'x'.repeat(15_000);
      const r = buildZenoContextBlock(
        [
          { name: 'a', body: big },
          { name: 'b', body: big },
        ],
        [],
        ZENO_CONTEXT_CAP_BYTES,
      );
      expect(r.droppedSkills).toEqual(['b']);
      expect(r.block).toContain('## a');
      expect(r.block).not.toContain('## b');
      expect(r.requestedBytes).toBeGreaterThan(ZENO_CONTEXT_CAP_BYTES);
      expect(r.truncatedBytes).toBeLessThanOrEqual(ZENO_CONTEXT_CAP_BYTES);
    });

    it('keeps order stable when truncating from the tail', () => {
      const r = buildZenoContextBlock(
        [
          { name: 'first', body: 'x'.repeat(10_000) },
          { name: 'second', body: 'x'.repeat(15_000) },
          { name: 'third', body: 'x'.repeat(15_000) },
        ],
        [],
      );
      expect(r.droppedSkills).toEqual(['second', 'third']);
      expect(r.block).toContain('## first');
    });
  });
  ```

- [ ] **B.1.3** Run: `pnpm --filter @zeno/worker exec vitest run tests/cron/zeno-context-block.test.ts`. Expect: 6/6 green.

### Task B.2 — `ConnectorGatedBackend` rewrite (pendingCron* fields + skill-level cache + audit log)

- [ ] **B.2.1** Open `apps/worker/src/guardrails/connector-gated-backend.ts`. Apply the rewrite. The new shape (full file):
  ```ts
  /**
   * `ConnectorGatedBackend` — wraps a `ClaudeCodeBackend` with the connector-
   * permission gate, the single guardrail surviving spec 0050. Spec 0052 added
   * skill injection on connector tool calls. Spec 0054 extends this with
   * cron-side force-injection + unlinked-connector audit logging.
   *
   * Spec 0054: the wrapper now exposes two methods the cron runner calls
   * BEFORE `query()`:
   *   - preInjectCronSkills(skillIds: string[]): mark these skills as already
   *     injected for the upcoming run so the existing PreToolUse hook does
   *     not re-inject them when an mcp__<slug>__* tool fires.
   *   - preInjectCronContext({ runId, linkedSlugs }): enable the
   *     `cron_used_unlinked_connector` audit log for the upcoming run.
   *
   * Both pendingCron* fields are cleared in the wrapper's `query()` finally
   * block. Relies on the cron runner's serial tick processing — concurrent
   * cron firings on a single backend instance are NOT supported by today's
   * runner and would race this state machine.
   */

  import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
  import type { Logger } from '@zeno/logger';
  import type { AgentCapabilityRepo, ConnectorRepo, ConnectorSkillRepo } from '@zeno/storage';
  import type { ClaudeCodeBackend } from '@/agent/backends/claude-code';
  import type { AgentBackend, AgentInput, AgentOutput } from '@/agent/types';
  import { checkConnectorPermission } from '@/guardrails/policies/connector-permission';

  const TOOL_NAME_REGEX = /^mcp__([a-z0-9][a-z0-9-]*)__(.+)$/;

  export interface ConnectorGatedBackendDeps {
    connectorRepo: ConnectorRepo;
    agentCapabilityRepo: AgentCapabilityRepo;
    connectorSkillRepo: ConnectorSkillRepo;
    logger?: Logger;
  }

  interface PendingCronContext {
    runId: string;
    linkedSlugs: Set<string>;
    /** Dedup `(connectorSlug, toolName)` triplet for `cron_used_unlinked_connector`. */
    auditDedup: Set<string>;
  }

  export class ConnectorGatedBackend implements AgentBackend {
    readonly name = 'claude-code-connector-gated';

    /**
     * Spec 0052 + 0054: per-session cache. Keys differ between spec 0052
     * (slug-level: `${sessionId}:${slug}`) and spec 0054's rewrite
     * (skill-level: `${sessionId}:skill:${skillId}`). Spec 0054 unifies on
     * skill-level keys so cron force-injection can dedupe with the hook's
     * connector-driven injection on a per-skill basis.
     */
    private readonly injectedSkillsCache = new Map<string, true>();

    /** Spec 0054: skill ids the runner pre-injected via [zeno_context]. Cleared in finally. */
    private pendingCronSkillIds: string[] = [];

    /** Spec 0054: enables unlinked-connector audit logs for the current run. Cleared in finally. */
    private pendingCronContext: PendingCronContext | null = null;

    constructor(
      private readonly inner: ClaudeCodeBackend,
      private readonly deps: ConnectorGatedBackendDeps,
    ) {}

    async query(input: AgentInput): Promise<AgentOutput> {
      try {
        return await this.inner.query(input);
      } finally {
        this.pendingCronSkillIds = [];
        this.pendingCronContext = null;
      }
    }

    /**
     * Spec 0054: the cron runner calls this BEFORE `query()` to register the
     * skills it has prepended via [zeno_context]. The hook transfers these
     * IDs into `injectedSkillsCache` (keyed `${sessionId}:skill:${id}`) on
     * its first invocation, so the spec 0052 connector-driven injection
     * does not duplicate them.
     */
    preInjectCronSkills(skillIds: string[]): void {
      this.pendingCronSkillIds = [...skillIds];
    }

    /**
     * Spec 0054: the cron runner calls this BEFORE `query()` to enable the
     * `cron_used_unlinked_connector` audit log for the upcoming run.
     */
    preInjectCronContext(opts: { runId: string; linkedSlugs: string[] }): void {
      this.pendingCronContext = {
        runId: opts.runId,
        linkedSlugs: new Set(opts.linkedSlugs),
        auditDedup: new Set(),
      };
    }

    private getInjectionContext(sessionKey: string, slug: string): string | null {
      const connector = this.deps.connectorRepo.getBySlug(slug);
      if (!connector) return null;
      const linked = this.deps.connectorSkillRepo.listForConnector(connector.id);
      if (linked.length === 0) return null;

      // Spec 0054: skill-level cache. Filter out skills already injected
      // (either by a prior hook call OR by the cron runner's pre-inject).
      const remaining = linked.filter(
        (s) => !this.injectedSkillsCache.has(`${sessionKey}:skill:${s.id}`),
      );
      if (remaining.length === 0) return null;

      for (const s of remaining) {
        this.injectedSkillsCache.set(`${sessionKey}:skill:${s.id}`, true);
      }

      this.deps.logger?.info(
        {
          event: 'skill_injected',
          connectorSlug: slug,
          sessionId: sessionKey,
          skills: remaining.map((s) => s.name),
          count: remaining.length,
        },
        `injected ${remaining.length} linked skill(s) for connector ${slug}`,
      );
      const bodies = remaining.map((s) => `## ${s.name}\n\n${s.body}`).join('\n\n---\n\n');
      return `# Linked skills for connector \`${slug}\`\n\nThe operator has linked the following skill(s) to this connector. They describe how this operator wants tools of \`${slug}\` to be used. Read them before continuing with the tool call.\n\n${bodies}`;
    }

    /** Spec 0054: transfer pendingCronSkillIds into the per-session skill cache. */
    private absorbPendingCronSkills(sessionKey: string): void {
      if (this.pendingCronSkillIds.length === 0) return;
      for (const skillId of this.pendingCronSkillIds) {
        this.injectedSkillsCache.set(`${sessionKey}:skill:${skillId}`, true);
      }
    }

    /** Spec 0054: emit `cron_used_unlinked_connector` once per (runId, slug, tool) triplet. */
    private maybeEmitUnlinkedAudit(slug: string, toolName: string): void {
      if (!this.pendingCronContext) return;
      const ctx = this.pendingCronContext;
      if (ctx.linkedSlugs.has(slug)) return;
      const dedupKey = `${slug}:${toolName}`;
      if (ctx.auditDedup.has(dedupKey)) return;
      ctx.auditDedup.add(dedupKey);
      this.deps.logger?.info(
        {
          event: 'cron_used_unlinked_connector',
          runId: ctx.runId,
          connectorSlug: slug,
          toolName,
        },
        `cron run ${ctx.runId} used unlinked connector ${slug} (tool ${toolName})`,
      );
    }

    buildPreToolUseHook(): HookCallback {
      return async (input) => {
        const hookInput = input as PreToolUseHookInput;
        const toolName = hookInput.tool_name;
        const sessionKey =
          (hookInput as PreToolUseHookInput & { session_id?: string }).session_id ??
          'unknown-session';

        // Spec 0054: absorb cron pre-inject IDs idempotently on every call.
        this.absorbPendingCronSkills(sessionKey);

        const decision = checkConnectorPermission(
          this.deps.connectorRepo,
          this.deps.agentCapabilityRepo,
          toolName,
        );

        if (decision.allow) {
          let additionalContext: string | undefined;
          const match = toolName.match(TOOL_NAME_REGEX);
          const slug = match?.[1];
          if (slug) {
            additionalContext = this.getInjectionContext(sessionKey, slug) ?? undefined;
            // Spec 0054: audit log for unlinked-connector use during a cron.
            this.maybeEmitUnlinkedAudit(slug, toolName);
          }

          return {
            continue: true,
            hookSpecificOutput: {
              hookEventName: 'PreToolUse' as const,
              permissionDecision: 'allow' as const,
              permissionDecisionReason: decision.reason,
              ...(additionalContext ? { additionalContext } : {}),
            },
          };
        }

        const denyContext = `GUARDRAIL DENIAL — this is NOT a system permission error. The tool call was denied because the connector-permission gate evaluated it as not allowed. Reason: "${decision.reason}". Do NOT retry the tool, do NOT suggest adjusting permissions or hooks, do NOT troubleshoot. If the user asked for a capability you cannot perform, tell them so honestly.`;
        return {
          continue: true,
          reason: denyContext,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse' as const,
            permissionDecision: 'deny' as const,
            permissionDecisionReason: `policy_denied: ${decision.reason}`,
            additionalContext: denyContext,
          },
        };
      };
    }
  }
  ```

- [ ] **B.2.2** Open `apps/worker/tests/guardrails/connector-gated-backend.test.ts` (find via `grep -rn "ConnectorGatedBackend" apps/worker/tests/`). Inspect existing tests; they likely assert the spec 0052 slug-level injection with the OLD cache key. Update those tests to use the NEW skill-level cache key (the assertion targets are: `injectedSkillsCache.has(...)` calls and behavior on second call).

  After updating existing tests, append three new tests for spec 0054:
  ```ts
  describe('spec 0054 — cron pre-inject + audit', () => {
    it('preInjectCronSkills marks skills as cached so the hook does not re-inject them', async () => {
      // Setup a connector with one linked skill. Cron pre-injects that same
      // skill. Hook fires for an mcp__<slug>__* tool. additionalContext
      // should be undefined (no body) because the skill is already cached.
      // ...
    });

    it('preInjectCronSkills + connector with one extra skill builds body for the extra only (partial dedup)', async () => {
      // Connector linked to [s1, s2]. Cron pre-injects [s1]. Hook fires.
      // additionalContext should contain s2 only.
    });

    it('preInjectCronContext: hook emits cron_used_unlinked_connector once per (runId, slug, tool) triplet', async () => {
      // Cron's linkedSlugs = ['linear']. Hook fires for mcp__github__x three
      // times. Expect logger.info(`cron_used_unlinked_connector`) once.
    });

    it('preInjectCronContext: hook does NOT emit when slug IS in linkedSlugs', async () => {
      // Cron's linkedSlugs = ['github']. Hook fires for mcp__github__x.
      // Expect NO cron_used_unlinked_connector log.
    });

    it('query() clears pendingCronSkillIds and pendingCronContext in finally', async () => {
      // Mock inner.query to throw. After awaiting and catching, assert
      // (gated as any).pendingCronSkillIds.length === 0 and
      // (gated as any).pendingCronContext === null.
    });
  });
  ```

  Implement each test concretely. The mock backend pattern: the test file already has a `MockClaudeCodeBackend`; if not, build a thin one that returns `{ text: '', toolCalls: [] }` from `query()` and exposes nothing else — then drive the hook directly via `gated.buildPreToolUseHook()(input)`.

- [ ] **B.2.3** Run: `pnpm --filter @zeno/worker exec vitest run tests/guardrails/connector-gated-backend.test.ts`. Expect: green (existing + new).

### Task B.3 — Wrap cron backend with the gate

- [ ] **B.3.1** Open `apps/worker/src/index.ts`. Find line 365 (the `backendForRunner = buildBackend(...)` call). The current shape is:
  ```ts
  const backendForRunner = buildBackend(logger, { getMcpServers, onInvocation });
  const runner = new CronRunner({ ... backend: backendForRunner ... });
  ```
  Replace with a gated wrap that mirrors the chat backend wiring (lines 407-429). The cron runner needs the `ConnectorGatedBackend` itself (not the inner `ClaudeCodeBackend`) because Phase B.4 calls `runner.opts.backend.preInjectCron*` methods. Refactor:
  ```ts
  // Spec 0054: cron backend now goes through the same gate as the chat
  // backend (single guardrail canon, spec 0050). The gate also owns the
  // pendingCron* state machine for force-injection + audit log dedup.
  let cronBackend: ConnectorGatedBackend | AgentBackend;
  if (isClaudeBackend) {
    const cronGatedDeps = {
      connectorRepo: connectors,
      agentCapabilityRepo,
      connectorSkillRepo,
      logger,
    };
    const cronTempInner = new ClaudeCodeBackend({ getMcpServers, inProcessMcpServers: { zeno: cronMcp } });
    const cronPreToolUseHook = new ConnectorGatedBackend(cronTempInner, cronGatedDeps).buildPreToolUseHook();
    const cronGatedInner = new ClaudeCodeBackend({
      getMcpServers,
      inProcessMcpServers: { zeno: cronMcp },
      preToolUseHook: cronPreToolUseHook,
      onInvocation,
    });
    cronBackend = new ConnectorGatedBackend(cronGatedInner, cronGatedDeps);
  } else {
    cronBackend = buildBackend(logger, { getMcpServers, onInvocation });
  }
  const runner = new CronRunner({
    crons,
    cronRuns,
    backend: cronBackend,
    cronSkillRepo,
    cronConnectorRepo,
    getSystemPrompt: () => promptHolder.value,
    workspaceDir: config.workspaceDir,
    channel: slack,
    defaultConversationId: defaultCronChannel,
  });
  ```
  Notes:
  - The `cronMcp` variable is constructed AFTER line 365 today (line 403 — `buildCronMcpServer`). Move `buildCronMcpServer` BEFORE the cron-backend construction so `cronMcp` is in scope.
  - Pass `cronSkillRepo` + `cronConnectorRepo` (constructed earlier in the file alongside `connectorSkillRepo` — add the construction right above) to the CronRunner.
  - Update the `CronRunner` type annotation on `runner` if needed; the runner class accepts an `AgentBackend`, but Phase B.4 widens the property type to allow optional `preInjectCron*` calls.

- [ ] **B.3.2** Add `cronSkillRepo` + `cronConnectorRepo` construction near the top of `main()` (alongside the existing repo constructions, ≈ line 192):
  ```ts
  const connectorSkillRepo = new ConnectorSkillRepo(db);
  const cronSkillRepo = new CronSkillRepo(db);
  const cronConnectorRepo = new CronConnectorRepo(db);
  ```
  Update the import list at the top of the file:
  ```ts
  import {
    // ...existing imports
    CronSkillRepo,
    CronConnectorRepo,
  } from '@zeno/storage';
  ```

- [ ] **B.3.3** Delete the now-stale comment block at lines 398-402 ("Crons still run UNGUARDED…"). Replace with a one-liner pointing to spec 0054 + the runner's serial-tick contract:
  ```ts
  // Spec 0054: cron backend wrapped with the same gate as the chat backend.
  // The gate is the single guardrail (spec 0050) and also owns the
  // pendingCron* state machine the runner relies on for force-injection +
  // audit log dedup. The runner processes due crons serially per tick, so
  // the instance-field state machine is race-free.
  ```

### Task B.4 — `CronRunner` injection

- [ ] **B.4.1** Open `apps/worker/src/cron/runner.ts`. Extend `CronRunnerOptions` with the two new repos:
  ```ts
  import type { Cron, CronRepo, CronRunRepo, CronSkillRepo, CronConnectorRepo } from '@zeno/storage';
  // ...
  interface CronRunnerOptions {
    crons: CronRepo;
    cronRuns: CronRunRepo;
    /** Spec 0054: linked skills + connectors per cron. Undefined-safe so MockBackend tests can omit. */
    cronSkills?: CronSkillRepo;
    cronConnectors?: CronConnectorRepo;
    backend: AgentBackend;
    getSystemPrompt: () => string;
    workspaceDir: string;
    channel: Channel;
    defaultConversationId?: string | null;
    tickMs?: number;
  }
  ```
  And update the constructor to read them — the new fields go on `this.opts` directly (no extra storage).

- [ ] **B.4.2** Find `private async execute(cron, firedAt)` in the same file. Wrap the existing `backend.query` call with the new prep + log:
  ```ts
  // Existing:
  // const output = await this.opts.backend.query({
  //   systemPrompt: this.opts.getSystemPrompt(),
  //   userMessage: cron.prompt,
  //   ...
  // });

  // Replace with:
  const linkedSkills = this.opts.cronSkills?.listForCron(cron.id) ?? [];
  const linkedConnectors = this.opts.cronConnectors?.listForCron(cron.id) ?? [];
  const linkedSlugs = linkedConnectors.map((c) => c.slug);

  const blockResult = buildZenoContextBlock(
    linkedSkills.map((s) => ({ name: s.name, body: s.body })),
    linkedSlugs,
  );

  const userMessage = blockResult.block
    ? `${blockResult.block}\n\n${cron.prompt}`
    : cron.prompt;

  // Spec 0054: pre-inject onto the gated backend so the spec 0052 hook
  // dedupes by skill id + emits unlinked-connector audit logs.
  const gated = this.opts.backend as Partial<{
    preInjectCronSkills: (ids: string[]) => void;
    preInjectCronContext: (opts: { runId: string; linkedSlugs: string[] }) => void;
  }>;
  if (gated.preInjectCronSkills) gated.preInjectCronSkills(linkedSkills.map((s) => s.id));
  if (gated.preInjectCronContext) {
    gated.preInjectCronContext({ runId: run.id, linkedSlugs });
  }

  if (linkedSkills.length > 0 || linkedSlugs.length > 0) {
    logger.info(
      {
        event: 'cron_skill_injected',
        cronId: cron.id,
        runId: run.id,
        skills: linkedSkills.map((s) => s.name),
        connectors: linkedSlugs,
        totalBytes: blockResult.truncatedBytes,
      },
      `injected ${linkedSkills.length} skill(s) + ${linkedSlugs.length} connector slug(s) into cron prompt`,
    );
  }
  if (blockResult.droppedSkills.length > 0) {
    logger.warn(
      {
        event: 'cron_skill_truncated',
        cronId: cron.id,
        runId: run.id,
        requestedBytes: blockResult.requestedBytes,
        truncatedBytes: blockResult.truncatedBytes,
        droppedSkills: blockResult.droppedSkills,
      },
      `truncated cron skill bodies past the 20KB cap`,
    );
  }

  const output = await this.opts.backend.query({
    systemPrompt: this.opts.getSystemPrompt(),
    userMessage,
    cwd: this.opts.workspaceDir,
    correlationId,
    persistSession: false,
  });
  ```
  Add the import at the top of the file:
  ```ts
  import { buildZenoContextBlock } from '@/cron/zeno-context-block';
  ```

### Task B.5 — Tests: runner injection

- [ ] **B.5.1** Create `apps/worker/tests/cron/runner-injection.test.ts`. Drive a `CronRunner` with a `MockBackend`-like shim that captures the `userMessage`. Assert:
  ```ts
  import { describe, expect, it, vi } from 'vitest';
  import {
    closeDatabase,
    ConnectorRepo,
    CronConnectorRepo,
    CronRepo,
    CronRunRepo,
    CronSkillRepo,
    openDatabase,
    runMigrations,
    SkillRepo,
  } from '@zeno/storage';
  import { CronRunner } from '@/cron/runner';

  describe('CronRunner injection (spec 0054)', () => {
    function setup() {
      const db = openDatabase(':memory:');
      runMigrations(db);
      return {
        db,
        crons: new CronRepo(db),
        cronRuns: new CronRunRepo(db),
        cronSkills: new CronSkillRepo(db),
        cronConnectors: new CronConnectorRepo(db),
        skills: new SkillRepo(db),
        connectors: new ConnectorRepo(db),
        close: () => closeDatabase(db),
      };
    }

    function makeRunner(repos: ReturnType<typeof setup>, captures: { userMessage?: string; preInject?: { skills?: string[]; ctx?: unknown } }) {
      const backend = {
        name: 'mock',
        async query(input: { userMessage: string }) {
          captures.userMessage = input.userMessage;
          return { text: 'ok', toolCalls: [] };
        },
        preInjectCronSkills(ids: string[]) {
          captures.preInject = { ...(captures.preInject ?? {}), skills: ids };
        },
        preInjectCronContext(ctx: unknown) {
          captures.preInject = { ...(captures.preInject ?? {}), ctx };
        },
      };
      return new CronRunner({
        crons: repos.crons,
        cronRuns: repos.cronRuns,
        cronSkills: repos.cronSkills,
        cronConnectors: repos.cronConnectors,
        backend,
        getSystemPrompt: () => 'sys',
        workspaceDir: '/tmp',
        channel: { name: 'mock', send: vi.fn().mockResolvedValue(undefined) } as never,
        defaultConversationId: 'C',
      });
    }

    it('zero linked skills + zero linked connectors → userMessage unchanged', async () => {
      const repos = setup();
      const captures: { userMessage?: string } = {};
      const runner = makeRunner(repos, captures);
      const cron = repos.crons.create({ name: 'c', prompt: 'hello', schedule: '* * * * *', source: 'chat' });
      await runner.runOnce(cron);
      expect(captures.userMessage).toBe('hello');
      repos.close();
    });

    it('linked skill is force-injected as [zeno_context] block before the prompt', async () => {
      const repos = setup();
      const captures: { userMessage?: string; preInject?: { skills?: string[] } } = {};
      const runner = makeRunner(repos, captures);
      const cron = repos.crons.create({ name: 'c', prompt: 'do it', schedule: '* * * * *', source: 'chat' });
      const skill = repos.skills.create({ name: 'fn-flow', description: 'd', body: 'BODY' });
      repos.cronSkills.add(cron.id, skill.id);
      await runner.runOnce(cron);
      expect(captures.userMessage).toContain('[zeno_context]');
      expect(captures.userMessage).toContain('linked_skills:');
      expect(captures.userMessage).toContain('## fn-flow');
      expect(captures.userMessage).toContain('BODY');
      expect(captures.userMessage).toMatch(/\[\/zeno_context\]\n\ndo it$/);
      expect(captures.preInject?.skills).toEqual([skill.id]);
      repos.close();
    });

    it('linked connector slug is appended to the [zeno_context] block', async () => {
      const repos = setup();
      const captures: { userMessage?: string; preInject?: { ctx?: { runId: string; linkedSlugs: string[] } } } = {};
      const runner = makeRunner(repos, captures);
      const cron = repos.crons.create({ name: 'c', prompt: 'do it', schedule: '* * * * *', source: 'chat' });
      const conn = repos.connectors.create({
        slug: 'linear',
        displayName: 'Linear',
        source: 'catalog',
        catalogId: 'linear',
        transport: 'remote',
        url: 'https://x',
        tools: [],
        secrets: [],
      });
      repos.cronConnectors.add(cron.id, conn.id);
      await runner.runOnce(cron);
      expect(captures.userMessage).toContain('linked_connectors: linear');
      expect(captures.preInject?.ctx?.linkedSlugs).toEqual(['linear']);
      repos.close();
    });

    it('skills + connectors → both surface in the block', async () => {
      const repos = setup();
      const captures: { userMessage?: string } = {};
      const runner = makeRunner(repos, captures);
      const cron = repos.crons.create({ name: 'c', prompt: 'P', schedule: '* * * * *', source: 'chat' });
      const skill = repos.skills.create({ name: 's', description: 'd', body: 'B' });
      const conn = repos.connectors.create({ slug: 'linear', displayName: 'L', source: 'catalog', catalogId: 'linear', transport: 'remote', url: 'https://x', tools: [], secrets: [] });
      repos.cronSkills.add(cron.id, skill.id);
      repos.cronConnectors.add(cron.id, conn.id);
      await runner.runOnce(cron);
      expect(captures.userMessage).toContain('linked_skills:');
      expect(captures.userMessage).toContain('linked_connectors: linear');
      repos.close();
    });

    // Truncation behavior is covered end-to-end in the block-builder test
    // (`zeno-context-block.test.ts` — droppedSkills assertion). The runner
    // just emits a `cron_skill_truncated` log when `droppedSkills.length > 0`,
    // which is straight-line wrapper code. We do NOT add a runner-level
    // truncation test to avoid coupling to the module-level `logger`
    // singleton; the block builder is the source of truth for this logic.
  });
  ```

- [ ] **B.5.2** Run: `pnpm --filter @zeno/worker exec vitest run tests/cron/runner-injection.test.ts`. Expect green.

### Task B.6 — Worker test suite green

- [ ] **B.6.1** Run all worker tests: `pnpm --filter @zeno/worker test`. Fix any regression introduced by the gated-backend rewrite. Likely candidates: existing `connector-gated-backend.test.ts` cases that asserted the OLD slug-level cache behavior. Update the assertions to the new skill-level cache.

### Task B.7 — Commit Phase B

- [ ] **B.7.1** Commit:
  ```bash
  git add apps/worker/ packages/storage/
  git commit -m "feat(worker): cron force-injection + audit + gated cron backend (spec 0054 phase B)"
  ```

- [ ] **B.7.2** Quality gate.

- [ ] **B.7.3** **R1/R2/R3 review** of Phase B. Look for: forgotten finally clear, slug-level cache key still appearing in code, runner failing the silent-skip-on-deleted-skill test, unlinked-audit firing twice, hook regressions in interactive flows. Reset on any finding.

---

## Phase C — API routes

### Task C.1 — `cron-skills` route

- [ ] **C.1.1** Create `apps/api/src/routes/cron-skills.ts`. Mirror `connector-skills.ts` 1-for-1 (replace `connectors`/`connectorSkills` with `crons`/`cronSkills`):
  ```ts
  /**
   * Cron ↔ skill M:N link API. Spec 0054.
   *
   * Mounted as a sub-route under /api/crons/:id/skills.
   */
  import { zValidator } from '@hono/zod-validator';
  import type { CronRepo, CronSkillRepo } from '@zeno/storage';
  import { Hono } from 'hono';
  import { z } from 'zod';

  export interface CronSkillsRouteDeps {
    crons: CronRepo;
    cronSkills: CronSkillRepo;
  }

  const replaceBody = z.object({ skillIds: z.array(z.string()) });

  export function buildCronSkillsRoute(deps: CronSkillsRouteDeps): Hono {
    const route = new Hono();

    route.get('/:id/skills', (c) => {
      const id = c.req.param('id');
      const cron = deps.crons.get(id);
      if (!cron) return c.json({ error: 'cron_not_found' }, 404);
      const linked = deps.cronSkills.listForCron(id).map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        updatedAt: s.updatedAt,
      }));
      return c.json(linked);
    });

    route.patch('/:id/skills', zValidator('json', replaceBody), (c) => {
      const id = c.req.param('id');
      const cron = deps.crons.get(id);
      if (!cron) return c.json({ error: 'cron_not_found' }, 404);
      const { skillIds } = c.req.valid('json');
      deps.cronSkills.replaceForCron(id, skillIds);
      return c.body(null, 204);
    });

    return route;
  }
  ```

### Task C.2 — `cron-connectors` route

- [ ] **C.2.1** Create `apps/api/src/routes/cron-connectors.ts`:
  ```ts
  /**
   * Cron ↔ connector M:N link API. Spec 0054.
   *
   * Mounted as a sub-route under /api/crons/:id/connectors. The link is a
   * hint to the agent; the connector-permission gate (spec 0050) stays the
   * single allow/deny authority.
   */
  import { zValidator } from '@hono/zod-validator';
  import type { CronConnectorRepo, CronRepo } from '@zeno/storage';
  import { Hono } from 'hono';
  import { z } from 'zod';

  export interface CronConnectorsRouteDeps {
    crons: CronRepo;
    cronConnectors: CronConnectorRepo;
  }

  const replaceBody = z.object({ connectorIds: z.array(z.string()) });

  export function buildCronConnectorsRoute(deps: CronConnectorsRouteDeps): Hono {
    const route = new Hono();

    route.get('/:id/connectors', (c) => {
      const id = c.req.param('id');
      const cron = deps.crons.get(id);
      if (!cron) return c.json({ error: 'cron_not_found' }, 404);
      const linked = deps.cronConnectors.listForCron(id).map((conn) => ({
        id: conn.id,
        slug: conn.slug,
        displayName: conn.displayName,
        status: conn.status,
      }));
      return c.json(linked);
    });

    route.patch('/:id/connectors', zValidator('json', replaceBody), (c) => {
      const id = c.req.param('id');
      const cron = deps.crons.get(id);
      if (!cron) return c.json({ error: 'cron_not_found' }, 404);
      const { connectorIds } = c.req.valid('json');
      deps.cronConnectors.replaceForCron(id, connectorIds);
      return c.body(null, 204);
    });

    return route;
  }
  ```

### Task C.3 — Wire into `server.ts`

- [ ] **C.3.1** Open `apps/api/src/server.ts`. Add imports:
  ```ts
  import type { CronConnectorRepo, CronSkillRepo } from '@zeno/storage';
  import { buildCronSkillsRoute } from '@/routes/cron-skills';
  import { buildCronConnectorsRoute } from '@/routes/cron-connectors';
  ```
  Add to `AppDeps`:
  ```ts
  /** Spec 0054: cron ↔ skills M:N. Optional in tests that don't exercise it. */
  cronSkillRepo?: CronSkillRepo;
  /** Spec 0054: cron ↔ connectors M:N. Optional in tests that don't exercise it. */
  cronConnectorRepo?: CronConnectorRepo;
  ```
  Mount the routes after the existing `/api/crons` mount (≈ line 87):
  ```ts
  // Spec 0054: cron ↔ skills + connectors M:N (mounted under /api/crons).
  if (deps.cronSkillRepo) {
    app.route(
      '/api/crons',
      buildCronSkillsRoute({ crons: deps.cronRepo, cronSkills: deps.cronSkillRepo }),
    );
  }
  if (deps.cronConnectorRepo) {
    app.route(
      '/api/crons',
      buildCronConnectorsRoute({ crons: deps.cronRepo, cronConnectors: deps.cronConnectorRepo }),
    );
  }
  ```
  (Auth is already covered by the `/api/crons*` middleware mounted earlier.)

- [ ] **C.3.2** Open `apps/api/src/index.ts`. Construct + pass the new repos:
  ```ts
  import { CronConnectorRepo, CronSkillRepo /* ...other imports */ } from '@zeno/storage';
  // ...
  const cronSkillRepo = new CronSkillRepo(db);
  const cronConnectorRepo = new CronConnectorRepo(db);
  // ...
  const app = createApp({
    // ...existing fields
    cronSkillRepo,
    cronConnectorRepo,
  });
  ```

### Task C.4 — Tests: API routes

- [ ] **C.4.1** Create `apps/api/tests/routes/cron-skills.test.ts`. Mirror `apps/api/tests/routes/connector-skills.test.ts` (replace `connector` with `cron` and `Connector*` types with `Cron*`). Cover:
  - GET 404 on unknown cron
  - GET empty array on no links
  - GET sorted-by-name linked skills
  - PATCH atomic replace
  - PATCH with empty array clears
  - PATCH 404 on unknown cron

- [ ] **C.4.2** Create `apps/api/tests/routes/cron-connectors.test.ts`. Same shape but for connectors. Linked items return `{ id, slug, displayName, status }` (test that all four fields are present).

- [ ] **C.4.3** Run: `pnpm --filter @zeno/api test`. Expect green.

### Task C.5 — Commit Phase C

- [ ] **C.5.1** Commit:
  ```bash
  git add apps/api/
  git commit -m "feat(api): /api/crons/:id/skills + /:id/connectors (spec 0054 phase C)"
  ```

- [ ] **C.5.2** Quality gate.

- [ ] **C.5.3** **R1/R2/R3 review** of Phase C.

---

## Phase D — Dashboard

### Task D.1 — TanStack hooks

- [ ] **D.1.1** Create `apps/dashboard/src/lib/use-cron-skills.ts`. Mirror `use-connector-skills.ts`:
  ```ts
  import { useQuery } from '@tanstack/react-query';
  import { apiFetch } from '@/lib/api-client';
  import { useOptimisticMutation } from '@/lib/use-optimistic-mutation';

  export interface LinkedCronSkill {
    id: string;
    name: string;
    description: string;
    updatedAt: string;
  }

  export function useCronSkills(cronId: string | undefined) {
    return useQuery({
      queryKey: ['cron-skills', cronId],
      queryFn: () => apiFetch<LinkedCronSkill[]>(`/api/crons/${cronId}/skills`),
      enabled: Boolean(cronId),
    });
  }

  export function useReplaceCronSkills() {
    return useOptimisticMutation<{ cronId: string; skillIds: string[] }, void>({
      mutationFn: ({ cronId, skillIds }) =>
        apiFetch<void>(`/api/crons/${cronId}/skills`, {
          method: 'PATCH',
          body: JSON.stringify({ skillIds }),
        }),
      invalidateKeys: ({ cronId }) => [['cron-skills', cronId], ['skills']],
      successToast: 'linked skills updated',
    });
  }
  ```

- [ ] **D.1.2** Create `apps/dashboard/src/lib/use-cron-connectors.ts`. Mirror, with the connector shape:
  ```ts
  import { useQuery } from '@tanstack/react-query';
  import { apiFetch } from '@/lib/api-client';
  import { useOptimisticMutation } from '@/lib/use-optimistic-mutation';

  export interface LinkedCronConnector {
    id: string;
    slug: string;
    displayName: string;
    status: 'enabled' | 'disabled' | 'pending';
  }

  export function useCronConnectors(cronId: string | undefined) {
    return useQuery({
      queryKey: ['cron-connectors', cronId],
      queryFn: () => apiFetch<LinkedCronConnector[]>(`/api/crons/${cronId}/connectors`),
      enabled: Boolean(cronId),
    });
  }

  export function useReplaceCronConnectors() {
    return useOptimisticMutation<{ cronId: string; connectorIds: string[] }, void>({
      mutationFn: ({ cronId, connectorIds }) =>
        apiFetch<void>(`/api/crons/${cronId}/connectors`, {
          method: 'PATCH',
          body: JSON.stringify({ connectorIds }),
        }),
      invalidateKeys: ({ cronId }) => [['cron-connectors', cronId], ['connectors']],
      successToast: 'linked connectors updated',
    });
  }
  ```

### Task D.2 — `LinkedSkillsSection` (cron variant)

- [ ] **D.2.1** Create `apps/dashboard/src/components/crons/linked-skills-section.tsx`. Export the component as `LinkedCronSkillsSection` (NOT `LinkedSkillsSection` — the latter already exists at `@/components/skills/linked-skills-section.tsx` and would collide). Copy that file as the basis and adapt:
  - Component name: `LinkedCronSkillsSection`.
  - Props: `{ cronId: string; cronName: string }` instead of `{ connectorId, connectorSlug }`.
  - Hook: `useCronSkills(cronId)` instead of `useConnectorSkills(connectorId)`.
  - Mutation: `useReplaceCronSkills()` instead of `useReplaceConnectorSkills()`.
  - Header copy: "linked skills" (same).
  - Header subline: `spec 0054 · injected as [zeno_context] before the cron prompt`.
  - Empty-state copy: "No skills linked. The cron prompt runs as-is."
  - Picker invocation: `<LinkCronSkillPickerModal cronId={cronId} cronName={cronName} initialLinkedIds={...} onClose={...} />` (modal export from D.4.1 is `LinkCronSkillPickerModal`).

### Task D.3 — `LinkedConnectorsSection` (cron variant)

- [ ] **D.3.1** Create `apps/dashboard/src/components/crons/linked-connectors-section.tsx`. Same shape as D.2 but for connectors. Export as `LinkedCronConnectorsSection`. The row body shows `{slug}` mono + `{displayName}` sans + a small status indicator. No body or description (connectors don't have skill bodies). Header subline: `spec 0054 · hint mode · gate stays the single guardrail`. Picker invocation: `<LinkCronConnectorPickerModal ... />` (D.4.2).

### Task D.4 — Picker modals

- [ ] **D.4.1** Create `apps/dashboard/src/components/crons/link-skill-picker-modal.tsx`. Export as `LinkCronSkillPickerModal`. Copy `apps/dashboard/src/components/skills/link-skill-picker-modal.tsx` (the connector-skill picker) and adapt:
  - Component name: `LinkCronSkillPickerModal`.
  - Props: `{ cronId; cronName; initialLinkedIds; onClose }`.
  - Mutation: `useReplaceCronSkills()`.
  - Header text: `Link skills to <em>{cronName}</em>`.
  - Sub-copy: "Selected skills are force-injected as [zeno_context] before the cron prompt fires."
  - Save calls `replace.mutateAsync({ cronId, skillIds: [...selected] })`.

- [ ] **D.4.2** Create `apps/dashboard/src/components/crons/link-connector-picker-modal.tsx`. Export as `LinkCronConnectorPickerModal`. Same shape as D.4.1, but the picker lists CONNECTORS (use `useConnectors()` to source the master list — read the existing hook at `apps/dashboard/src/lib/use-connectors.ts`). Each row shows `{slug}` + `{displayName}` + status pill. Save calls `useReplaceCronConnectors().mutateAsync({ cronId, connectorIds })`.

### Task D.5 — Wire into `crons.$id.tsx`

- [ ] **D.5.1** Open `apps/dashboard/src/routes/_authed/crons.$id.tsx`. Add imports:
  ```tsx
  import { LinkedCronSkillsSection } from '@/components/crons/linked-skills-section';
  import { LinkedCronConnectorsSection } from '@/components/crons/linked-connectors-section';
  ```
  In `CronDetailScreen`'s JSX, between `<PromptBlock>` and `<StatsStrip>`, render:
  ```tsx
  <PromptBlock prompt={cron.prompt} />
  <LinkedCronSkillsSection cronId={cron.id} cronName={cron.name} />
  <LinkedCronConnectorsSection cronId={cron.id} cronName={cron.name} />
  <StatsStrip cron={cron} runs={recentRuns} />
  ```

### Task D.6 — Quick smoke (dashboard typecheck)

- [ ] **D.6.1** Run: `pnpm --filter @zeno/dashboard typecheck`. Expect: green.

### Task D.7 — Commit Phase D

- [ ] **D.7.1** Commit:
  ```bash
  git add apps/dashboard/
  git commit -m "feat(dashboard): cron detail — linked skills + linked connectors sections (spec 0054 phase D)"
  ```

- [ ] **D.7.2** Quality gate.

- [ ] **D.7.3** **R1/R2/R3 review** of Phase D. Look for: hook key collisions with existing `cron-*` keys, picker modal not invalidating after save, layout shift on the cron detail page, accessibility (button focus / aria-label), copy clarity.

---

## Phase E — Quality gate + Docker boot test

### Task E.1 — Whole-repo quality gate

- [ ] **E.1.1** `pnpm -w run quality-gate`. Must pass. If any test reds, fix before E.2.

### Task E.2 — Docker boot

- [ ] **E.2.1** `PROFILE=fn pnpm -w run docker:build`. Expect: clean build.

- [ ] **E.2.2** `PROFILE=fn pnpm -w run docker:up`. Wait ~30s for health.

- [ ] **E.2.3** `pnpm -w run docker:logs | head -200`. Look for:
  - `migrations_applied { applied: [16, 17] }` (or similar — the runMigrations log shape)
  - No errors during boot
  - `cron_runner_started`

- [ ] **E.2.4** From the dashboard at http://localhost:3000:
  - Navigate to `/crons/:id` for an existing cron. Confirm "linked skills" and "linked connectors" sections render with empty state.
  - Click "+ link a skill" → picker opens → multi-select works → save → row appears in the section.
  - Same for "+ link a connector".
  - Trigger `run-now` (existing button). Confirm in `docker:logs`:
    - `cron_skill_injected { skills: [...], connectors: [...], totalBytes }` if anything is linked
    - The cron's expected behavior happens.

- [ ] **E.2.5** Repeat with an unlinked-connector probe: ensure the cron prompt makes the agent call a tool from a connector NOT in the link list. Confirm `cron_used_unlinked_connector { runId, connectorSlug, toolName }` appears once.

- [ ] **E.2.6** `pnpm -w run docker:down`. Tear down for the next phase.

---

## Phase F — E2E via Slack (fn profile)

### Task F.1 — Setup

- [ ] **F.1.1** Confirm fn profile has the working `github-app-fnlivros` connector + the `fn-code-review` skill installed. (Both from spec 0053 — should already be there.)

- [ ] **F.1.2** Create `tmp/spec-0054-test-results.md` skeleton:
  ```markdown
  # Spec 0054 — E2E test results

  | # | Scenario | Trigger | Expected | Observed | Pass |
  |---|---|---|---|---|---|
  ```

- [ ] **F.1.3** `PROFILE=fn pnpm -w run docker:up`. Verify Slack listener is connected (`slack_realtime_connected` log).

### Task F.2 — Run E2E scenarios

For each scenario below, dispatch a `general-purpose` subagent to (a) create the test cron via the dashboard or `cron_create` slash command, (b) link skills/connectors via the dashboard, (c) trigger `run-now`, (d) read Slack reply + worker logs, (e) record outcome.

| # | Scenario | Setup | Expected outcome |
|---|---|---|---|
| 1 | Cron with no links runs as before | new cron `e2e-1`, prompt "post oi", no links | `cron_run_success`, no `[zeno_context]` block in trace, Slack message "oi" |
| 2 | Cron with 1 linked skill | `e2e-2`, prompt "review the most recent PR on AcmeBooks/ecommerce-frontend", link `fn-code-review` skill | Agent follows the fn-code-review playbook (formatting matches), `cron_skill_injected` log fires |
| 3 | Cron with 1 linked connector | `e2e-3`, prompt "list 3 PRs", link `github-app-fnlivros` | Agent uses GitHub connector, no `cron_used_unlinked_connector` log |
| 4 | Cron with linked connector but uses unlinked one | `e2e-4`, prompt "list issues on Linear AND PRs on GitHub", link only `linear` | Agent uses both, `cron_used_unlinked_connector` log fires once for github (per (runId, slug, toolName)) |
| 5 | Cron with linked skill + connector both | `e2e-5`, prompt review-style, link `fn-code-review` + `github-app-fnlivros` | Both surface in `[zeno_context]`, anti-double-inject (skill body appears once, not twice) |
| 6 | Cron force-inject persists across no-tool-call runs | `e2e-6`, prompt "what is your purpose? answer in one sentence" with linked skill | Skill body present in agent reasoning even though no tool fires |
| 7 | Truncation kicks in at 20 KB | `e2e-7`, link 4 large skills (mock big skills if needed) | `cron_skill_truncated` log fires with `droppedSkills` non-empty |
| 8 | Skill deletion cascades the link | `e2e-8`, link a skill, delete the skill via dashboard | next cron tick has no link, runs as before |
| 9 | Connector deletion cascades the link | `e2e-9`, link a connector, uninstall the connector | next cron tick has no connector hint, runs as before |
| 10 | Atomic replace works | `e2e-10`, link [s1, s2], PATCH to [s2, s3] | new link list = [s2, s3], next run injects only those |

- [ ] **F.2.1** Dispatch subagents 1-by-1 (serial) for scenarios 1–10. Each subagent fills its row in `tmp/spec-0054-test-results.md`.

- [ ] **F.2.2** Aggregate results. If any fails, reset Phase B/C/D 3-clean-rounds counter and fix.

### Task F.3 — Tear down

- [ ] **F.3.1** Delete the e2e crons via the dashboard so the fn profile stays clean.

- [ ] **F.3.2** `pnpm -w run docker:down`.

---

## Phase G — Final 3-round review on whole branch

### Task G.1 — Branch diff sanity

- [ ] **G.1.1** `git log --oneline main..HEAD` — confirm only spec 0054 commits (1 spec + 4 feat).

- [ ] **G.1.2** `git diff --stat main..HEAD` — confirm no out-of-scope files crept in.

### Task G.2 — Subagent review rounds

- [ ] **G.2.1** Dispatch a `general-purpose` review subagent with the brief: "Review the entire branch diff for spec 0054 against the spec at `context/specs/0054-cron-skills-and-connectors/spec.md`. Look for: spec drift, missing tests, anti-double-inject correctness, gate-rewrite regressions in interactive flows, audit-log dedup correctness, atomic-replace race windows, dashboard accessibility, copy clarity. Report findings or APPROVED."

- [ ] **G.2.2** Apply fixes. Reset counter on any finding.

- [ ] **G.2.3** Re-dispatch (R2). Apply fixes if any.

- [ ] **G.2.4** Re-dispatch (R3). Repeat until 3 consecutive clean reviews. **STOP** when the counter hits 3.

---

## Phase H — Push + open PR (REQUIRES EXPLICIT USER OK)

### Task H.1 — Surface readiness

- [ ] **H.1.1** Surface the branch state to the user: `git log --oneline main..HEAD` + a one-paragraph summary of what changed + the E2E pass count + the 3-clean-review counter status. Ask for explicit OK to push + open PR.

### Task H.2 — Push + PR

- [ ] **H.2.1** ON USER OK: `git push -u origin feat/cron-skills-and-connectors`.

- [ ] **H.2.2** Use the project's `/open-pr` flow with `base = main`. PR draft until the user reviews the description.

- [ ] **H.2.3** Notify the user with the PR URL + a one-line summary. Do NOT mark ready / request review without an explicit OK.
