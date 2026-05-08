import { and, asc, eq, sql } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { cronSkills, skills } from '../schema.js';
import type { Skill } from './connector-skills.js';

export interface CronSkillLink {
  cronId: string;
  skillId: string;
  createdAt: string;
}

type SkillRow = typeof skills.$inferSelect;
type LinkRow = typeof cronSkills.$inferSelect;

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

function rowToLink(row: LinkRow): CronSkillLink {
  return { cronId: row.cronId, skillId: row.skillId, createdAt: row.createdAt };
}

/**
 * Spec 0054: M:N relationship between crons and skills. The cron runner
 * reads `listForCron` per fire to build the [zeno_context] block prepended
 * to the cron prompt (force-injection). INNER JOIN ensures a deleted-but-
 * still-referenced skill is silently skipped — FK CASCADE drops the row,
 * but a race window can exist mid-tick if the dashboard mutates links.
 */
export class CronSkillRepo {
  constructor(private readonly db: RuntimeDB) {}

  listForCron(cronId: string): Skill[] {
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
      .innerJoin(cronSkills, eq(cronSkills.skillId, skills.id))
      .where(eq(cronSkills.cronId, cronId))
      .orderBy(asc(skills.name))
      .all();
    return rows.map(rowToSkill);
  }

  listForSkill(skillId: string): CronSkillLink[] {
    const rows = this.db
      .select()
      .from(cronSkills)
      .where(eq(cronSkills.skillId, skillId))
      .orderBy(asc(cronSkills.cronId))
      .all();
    return rows.map(rowToLink);
  }

  /**
   * Atomic replace of the cron's skill link list. Skill ids that don't
   * exist in `skills` are silently skipped. Single transaction.
   */
  replaceForCron(cronId: string, skillIds: string[]): void {
    this.db.transaction((tx) => {
      tx.delete(cronSkills).where(eq(cronSkills.cronId, cronId)).run();
      for (const skillId of skillIds) {
        tx.run(sql`
          INSERT INTO ${cronSkills} (cron_id, skill_id)
          SELECT ${cronId}, ${skillId}
          WHERE EXISTS (SELECT 1 FROM ${skills} WHERE id = ${skillId})
        `);
      }
    });
  }

  add(cronId: string, skillId: string): void {
    this.db
      .insert(cronSkills)
      .values({ cronId, skillId })
      .onConflictDoNothing({ target: [cronSkills.cronId, cronSkills.skillId] })
      .run();
  }

  remove(cronId: string, skillId: string): boolean {
    const result = this.db
      .delete(cronSkills)
      .where(and(eq(cronSkills.cronId, cronId), eq(cronSkills.skillId, skillId)))
      .run();
    return result.changes > 0;
  }
}
