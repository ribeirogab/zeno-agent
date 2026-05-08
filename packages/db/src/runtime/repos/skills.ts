import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { connectorSkills, skills } from '../schema.js';

export type SkillSource = 'zeno_default' | 'profile' | 'dashboard';

export interface Skill {
  id: string;
  name: string;
  description: string;
  source: SkillSource;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillInput {
  name: string;
  description: string;
  /** Spec 0053. Defaults to 'dashboard' for backward compat with spec 0052 uploads. */
  source?: SkillSource;
}

export interface UpdateSkillInput {
  description?: string;
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

interface SkillRow {
  id: string;
  name: string;
  description: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source: row.source as SkillSource,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
    private readonly db: RuntimeDB,
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
    const rows = this.db.select().from(skills).orderBy(asc(skills.name)).all();
    return rows.map((row) => rowToSkill(row as unknown as SkillRow));
  }

  get(id: string): Skill | null {
    const row = this.db.select().from(skills).where(eq(skills.id, id)).get();
    return row ? rowToSkill(row as unknown as SkillRow) : null;
  }

  getByName(name: string): Skill | null {
    const row = this.db.select().from(skills).where(eq(skills.name, name)).get();
    return row ? rowToSkill(row as unknown as SkillRow) : null;
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
      .insert(skills)
      .values({ id, name: input.name, description: input.description, source })
      .run();
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
    const existing = this.db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.name, input.name))
      .get();
    if (existing) {
      this.db
        .update(skills)
        .set({
          description: input.description,
          source: input.source,
          updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
        })
        .where(eq(skills.id, existing.id))
        .run();
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
    const orphans = this.db
      .select({ id: skills.id, name: skills.name })
      .from(skills)
      .where(
        allowedNames.length > 0
          ? and(eq(skills.source, source), notInArray(skills.name, allowedNames))
          : eq(skills.source, source),
      )
      .all();
    if (orphans.length === 0) return { removed: [], cascadeAffected: 0 };
    const ids = orphans.map((o) => o.id);
    const cascadeRow = this.db
      .select({ c: count() })
      .from(connectorSkills)
      .where(inArray(connectorSkills.skillId, ids))
      .get();
    this.db.delete(skills).where(inArray(skills.id, ids)).run();
    return {
      removed: orphans.map((o) => o.name),
      cascadeAffected: cascadeRow?.c ?? 0,
    };
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
    const set: Record<string, unknown> = {};
    if (patch.description !== undefined) set.description = patch.description;

    if (Object.keys(set).length === 0) return this.get(id);

    set.updatedAt = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
    const result = this.db.update(skills).set(set).where(eq(skills.id, id)).run();
    if (result.changes === 0) return null;
    return this.get(id);
  }

  delete(id: string): boolean {
    const result = this.db.delete(skills).where(eq(skills.id, id)).run();
    return result.changes > 0;
  }
}
