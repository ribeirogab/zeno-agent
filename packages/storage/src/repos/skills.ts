import { randomUUID } from 'node:crypto';
import type { DB } from '../db.js';
import type { CreateSkillInput, Skill, SkillSource, UpdateSkillInput } from '../types.js';

interface SkillRow {
  id: string;
  name: string;
  description: string;
  source: string;
  created_at: string;
  updated_at: string;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source: row.source as SkillSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Spec 0062: per-source FS roots are injected at construction time so
 * `canonicalPath(skill)` can resolve the on-disk location regardless of
 * caller. Production wires these from `apps/worker/src/index.ts` (boot)
 * and `apps/api/src/index.ts` (long-running API). Tests stub them.
 */
export interface SkillRoots {
  /** Read-only mount, ships with the worker image (`/app/agent/skills`). */
  agentSkillsRoot: string;
  /** Read-only mount per-profile (`/app/profile/skills`). */
  profileSkillsRoot: string;
  /** Writable persistent volume for dashboard uploads (`/workspace/skills`). */
  dashboardSkillsRoot: string;
}

/**
 * Spec 0052: skills are content-only markdown playbooks. Frontmatter:
 * `name` (UNIQUE) + `description`. Body was the rest of the .md file.
 *
 * Spec 0062: body moved from DB to FS. Each skill is a directory tree
 * rooted at `canonicalPath(skill)` containing `SKILL.md` plus arbitrary
 * supporting files. The repo stays the metadata catalog; the FS is the
 * content store.
 *
 * Lifecycle is install (create) / edit description / delete. Skills don't
 * carry permissions — capabilities are global (AgentCapabilityRepo).
 */
export class SkillRepo {
  constructor(
    private readonly db: DB,
    private readonly roots: SkillRoots,
  ) {}

  /**
   * Spec 0062: resolve the FS root that owns this skill's content.
   *
   * - `zeno_default` → `agentSkillsRoot/<name>` (image, RO)
   * - `profile`      → `profileSkillsRoot/<name>` (mount, RO)
   * - `dashboard`    → `dashboardSkillsRoot/<name>` (volume, RW)
   *
   * Single source of truth for the source→path mapping. Used by both
   * the API (file CRUD endpoints) and the worker (materializer symlink
   * target). No equivalent helper lives outside this class.
   */
  canonicalPath(skill: Skill): string {
    switch (skill.source) {
      case 'zeno_default':
        return `${this.roots.agentSkillsRoot}/${skill.name}`;
      case 'profile':
        return `${this.roots.profileSkillsRoot}/${skill.name}`;
      case 'dashboard':
        return `${this.roots.dashboardSkillsRoot}/${skill.name}`;
    }
  }

  list(): Skill[] {
    const rows = this.db.prepare('SELECT * FROM skills ORDER BY name ASC').all() as SkillRow[];
    return rows.map(rowToSkill);
  }

  get(id: string): Skill | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as
      | SkillRow
      | undefined;
    return row ? rowToSkill(row) : null;
  }

  getByName(name: string): Skill | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as
      | SkillRow
      | undefined;
    return row ? rowToSkill(row) : null;
  }

  /**
   * Insert a new skill metadata row. The caller writes the FS content
   * (e.g., the zip-install pipeline or the worker boot reconciler).
   * Throws on UNIQUE conflict — the API layer translates that to a 409
   * (spec 0052 resolved Open Question on name conflict).
   *
   * Spec 0053: `source` defaults to 'dashboard' so existing dashboard
   * upload paths stay unchanged. Boot seeder passes 'zeno_default' /
   * 'profile' explicitly.
   *
   * Spec 0062: `body` is no longer a parameter — the writer of the FS
   * dir owns the content.
   */
  create(input: CreateSkillInput): Skill {
    const id = randomUUID();
    const source: SkillSource = input.source ?? 'dashboard';
    this.db
      .prepare(`INSERT INTO skills (id, name, description, source) VALUES (?, ?, ?, ?)`)
      .run(id, input.name, input.description, source);
    const created = this.get(id);
    if (!created) throw new Error(`failed to read back skill ${id} after insert`);
    return created;
  }

  /**
   * Spec 0053: UPSERT path used by the boot seeder for `zeno_default` and
   * `profile` skills. If a row with this name exists, update
   * description/source/updated_at. Otherwise insert as-is. Different from
   * `create` because it never throws on UNIQUE conflict.
   *
   * Spec 0062: `body` is no longer a parameter.
   */
  upsertBySource(input: { name: string; description: string; source: SkillSource }): Skill {
    const existing = this.db.prepare('SELECT id FROM skills WHERE name = ?').get(input.name) as
      | { id: string }
      | undefined;
    if (existing) {
      this.db
        .prepare(
          `UPDATE skills SET description = ?, source = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?`,
        )
        .run(input.description, input.source, existing.id);
      const updated = this.get(existing.id);
      if (!updated) throw new Error(`skill ${input.name} disappeared during upsert`);
      return updated;
    }
    return this.create(input);
  }

  /**
   * Spec 0053: orphan cleanup at boot. Deletes rows of the given `source`
   * whose `name` is not in `allowedNames`. Returns the deleted names plus
   * the number of `connector_skills` rows that cascaded.
   *
   * Profile orphans are explicitly NOT deleted (operator may have
   * customized); the method is a no-op when called with
   * `source !== 'zeno_default'` to make accidental misuse from a planner
   * reading the spec a no-op rather than a footgun. The seeder only ever
   * calls it with 'zeno_default'.
   */
  deleteOrphans(
    source: SkillSource,
    allowedNames: string[],
  ): { removed: string[]; cascadeAffected: number } {
    if (source !== 'zeno_default') return { removed: [], cascadeAffected: 0 };
    const placeholders = allowedNames.map(() => '?').join(',');
    const where = allowedNames.length
      ? `WHERE source = ? AND name NOT IN (${placeholders})`
      : `WHERE source = ?`;
    const params = allowedNames.length ? [source, ...allowedNames] : [source];
    const orphans = this.db
      .prepare(`SELECT id, name FROM skills ${where}`)
      .all(...params) as Array<{
      id: string;
      name: string;
    }>;
    if (orphans.length === 0) return { removed: [], cascadeAffected: 0 };
    const idPlaceholders = orphans.map(() => '?').join(',');
    const ids = orphans.map((o) => o.id);
    const cascadeRow = this.db
      .prepare(`SELECT COUNT(*) AS c FROM connector_skills WHERE skill_id IN (${idPlaceholders})`)
      .get(...ids) as { c: number };
    this.db.prepare(`DELETE FROM skills WHERE id IN (${idPlaceholders})`).run(...ids);
    return { removed: orphans.map((o) => o.name), cascadeAffected: cascadeRow.c };
  }

  /**
   * Update description. Name is immutable in v1 — use delete + re-install
   * to rename. Touches `updated_at`.
   *
   * Spec 0062: body is no longer updatable through the repo. Body edits go
   * through the FS (e.g., `PUT /api/skills/:id/files/SKILL.md` writes the
   * file directly). When SKILL.md frontmatter changes, the route handler
   * calls `update(id, { description })` to keep the metadata catalog in
   * sync — the watcher path is the safety net for non-API mutations.
   */
  update(id: string, patch: UpdateSkillInput): Skill | null {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (patch.description !== undefined) {
      fields.push('description = ?');
      values.push(patch.description);
    }

    if (fields.length === 0) return this.get(id);

    fields.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
    values.push(id);
    const result = this.db
      .prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
    if (result.changes === 0) return null;
    return this.get(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM skills WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
