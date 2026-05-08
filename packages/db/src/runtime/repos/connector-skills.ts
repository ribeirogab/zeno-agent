import { and, asc, eq, sql } from 'drizzle-orm';
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

export interface ConnectorSkillLink {
  connectorId: string;
  skillId: string;
  createdAt: string;
}

type SkillRow = typeof skills.$inferSelect;
type LinkRow = typeof connectorSkills.$inferSelect;

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToLink(row: LinkRow): ConnectorSkillLink {
  return {
    connectorId: row.connectorId,
    skillId: row.skillId,
    createdAt: row.createdAt,
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
  constructor(private readonly db: RuntimeDB) {}

  /**
   * All skills currently linked to a connector. Ordered by skill name.
   * Used by the pre-tool-use hook + the connector detail page.
   */
  listForConnector(connectorId: string): Skill[] {
    const rows = this.db
      .select({
        id: skills.id,
        name: skills.name,
        description: skills.description,
        source: skills.source,
        createdAt: skills.createdAt,
        updatedAt: skills.updatedAt,
      })
      .from(skills)
      .innerJoin(connectorSkills, eq(connectorSkills.skillId, skills.id))
      .where(eq(connectorSkills.connectorId, connectorId))
      .orderBy(asc(skills.name))
      .all();
    return rows.map(rowToSkill);
  }

  /**
   * Connectors that link a given skill. Used by the skill detail page's
   * "linked connectors" read-only section (Paper artboard S3).
   */
  listForSkill(skillId: string): ConnectorSkillLink[] {
    const rows = this.db
      .select()
      .from(connectorSkills)
      .where(eq(connectorSkills.skillId, skillId))
      .orderBy(asc(connectorSkills.connectorId))
      .all();
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
    this.db.transaction((tx) => {
      tx.delete(connectorSkills).where(eq(connectorSkills.connectorId, connectorId)).run();
      for (const skillId of skillIds) {
        tx.run(sql`
          INSERT INTO ${connectorSkills} (connector_id, skill_id)
          SELECT ${connectorId}, ${skillId}
          WHERE EXISTS (SELECT 1 FROM ${skills} WHERE id = ${skillId})
        `);
      }
    });
  }

  add(connectorId: string, skillId: string): void {
    this.db
      .insert(connectorSkills)
      .values({ connectorId, skillId })
      .onConflictDoNothing({ target: [connectorSkills.connectorId, connectorSkills.skillId] })
      .run();
  }

  remove(connectorId: string, skillId: string): boolean {
    const result = this.db
      .delete(connectorSkills)
      .where(
        and(eq(connectorSkills.connectorId, connectorId), eq(connectorSkills.skillId, skillId)),
      )
      .run();
    return result.changes > 0;
  }
}
