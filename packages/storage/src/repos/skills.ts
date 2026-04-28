import { randomUUID } from 'node:crypto';
import type { DB } from '../db.js';
import type { CreateSkillInput, Skill, UpdateSkillInput } from '../types.js';

interface SkillRow {
  id: string;
  name: string;
  description: string;
  body: string;
  created_at: string;
  updated_at: string;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Spec 0052: skills are content-only markdown playbooks. Frontmatter:
 * `name` (UNIQUE) + `description`. Body is the rest of the .md file.
 *
 * Lifecycle is install (create) / edit body / delete. Skills don't carry
 * permissions — capabilities are global (AgentCapabilityRepo).
 */
export class SkillRepo {
  constructor(private readonly db: DB) {}

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
   * Insert a new skill. Throws on UNIQUE conflict — the API layer translates
   * that to a 409 response (spec 0052 resolved Open Question on name conflict).
   */
  create(input: CreateSkillInput): Skill {
    const id = randomUUID();
    this.db
      .prepare(`INSERT INTO skills (id, name, description, body) VALUES (?, ?, ?, ?)`)
      .run(id, input.name, input.description, input.body);
    const created = this.get(id);
    if (!created) throw new Error(`failed to read back skill ${id} after insert`);
    return created;
  }

  /**
   * Update description and/or body. Name is immutable in v1 — use delete +
   * re-install to rename. Touches `updated_at`.
   */
  update(id: string, patch: UpdateSkillInput): Skill | null {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (patch.description !== undefined) {
      fields.push('description = ?');
      values.push(patch.description);
    }
    if (patch.body !== undefined) {
      fields.push('body = ?');
      values.push(patch.body);
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
