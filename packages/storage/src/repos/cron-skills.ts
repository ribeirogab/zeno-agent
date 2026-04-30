import type { DB } from '../db.js';
import type { CronSkillLink, Skill, SkillSource } from '../types.js';

interface SkillRow {
  id: string;
  name: string;
  description: string;
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
 * reads `listForCron` per fire to build the [zeno_context] block prepended
 * to the cron prompt (force-injection). INNER JOIN ensures a deleted-but-
 * still-referenced skill is silently skipped — FK CASCADE drops the row,
 * but a race window can exist mid-tick if the dashboard mutates links.
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

  /**
   * Atomic replace of the cron's skill link list. Skill ids that don't
   * exist in `skills` are silently skipped. Single transaction.
   */
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
