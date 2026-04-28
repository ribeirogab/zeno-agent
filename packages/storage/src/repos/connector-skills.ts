import type { DB } from '../db.js';
import type { ConnectorSkillLink, Skill, SkillSource } from '../types.js';

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
  connector_id: string;
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

function rowToLink(row: LinkRow): ConnectorSkillLink {
  return {
    connectorId: row.connector_id,
    skillId: row.skill_id,
    createdAt: row.created_at,
  };
}

/**
 * Spec 0052: M:N relationship between connectors and skills. Operator
 * manages this from the connector detail page (Paper artboard C-skill-1)
 * via `replaceForConnector`. The pre-tool-use hook reads
 * `listForConnector(connectorId)` to inject linked-skill bodies into
 * context before that connector's tools fire.
 */
export class ConnectorSkillRepo {
  constructor(private readonly db: DB) {}

  /**
   * All skills currently linked to a connector. Ordered by skill name.
   * Used by the pre-tool-use hook + the connector detail page.
   */
  listForConnector(connectorId: string): Skill[] {
    const rows = this.db
      .prepare(
        `SELECT s.* FROM skills s
         INNER JOIN connector_skills cs ON cs.skill_id = s.id
         WHERE cs.connector_id = ?
         ORDER BY s.name ASC`,
      )
      .all(connectorId) as SkillRow[];
    return rows.map(rowToSkill);
  }

  /**
   * Connectors that link a given skill. Used by the skill detail page's
   * "linked connectors" read-only section (Paper artboard S3).
   */
  listForSkill(skillId: string): ConnectorSkillLink[] {
    const rows = this.db
      .prepare(`SELECT * FROM connector_skills WHERE skill_id = ? ORDER BY connector_id ASC`)
      .all(skillId) as LinkRow[];
    return rows.map(rowToLink);
  }

  /**
   * Atomic replace of the connector's link list. Rows for skill_ids that
   * don't exist in the `skills` table are silently skipped (defensive).
   *
   * Single transaction: DELETE all + INSERT new. The connector page's
   * multi-select multi-toggle pattern relies on this being atomic.
   */
  replaceForConnector(connectorId: string, skillIds: string[]): void {
    const txn = this.db.transaction(() => {
      this.db.prepare('DELETE FROM connector_skills WHERE connector_id = ?').run(connectorId);
      const insert = this.db.prepare(
        `INSERT INTO connector_skills (connector_id, skill_id)
         SELECT ?, ? WHERE EXISTS (SELECT 1 FROM skills WHERE id = ?)`,
      );
      for (const skillId of skillIds) {
        insert.run(connectorId, skillId, skillId);
      }
    });
    txn();
  }

  add(connectorId: string, skillId: string): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO connector_skills (connector_id, skill_id) VALUES (?, ?)`)
      .run(connectorId, skillId);
  }

  remove(connectorId: string, skillId: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM connector_skills WHERE connector_id = ? AND skill_id = ?`)
      .run(connectorId, skillId);
    return result.changes > 0;
  }
}
