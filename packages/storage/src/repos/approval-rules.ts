/**
 * `approval_rules` repository — sensitive-tool patterns. Spec 0047.
 *
 * Each row is a single glob pattern that, when matched against a tool name
 * during the guardrails check, triggers an approval request. Source enum
 * drives auto-cascade behavior on installation removal.
 */

import { randomUUID } from 'node:crypto';
import type { DB } from '../db.js';
import type { ApprovalRule, ApprovalRuleSource, CreateApprovalRuleInput } from '../types.js';

interface ApprovalRuleRow {
  id: string;
  pattern: string;
  source: string;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

function rowToRule(row: ApprovalRuleRow): ApprovalRule {
  return {
    id: row.id,
    pattern: row.pattern,
    source: row.source as ApprovalRuleSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notes: row.notes,
  };
}

export class ApprovalRulesRepo {
  constructor(private readonly db: DB) {}

  list(): ApprovalRule[] {
    const rows = this.db
      .prepare('SELECT * FROM approval_rules ORDER BY created_at ASC')
      .all() as ApprovalRuleRow[];
    return rows.map(rowToRule);
  }

  /** Returns just the patterns (used by the guardrails policy hot-path). */
  listPatterns(): string[] {
    const rows = this.db.prepare('SELECT pattern FROM approval_rules').all() as Array<{
      pattern: string;
    }>;
    return rows.map((r) => r.pattern);
  }

  get(id: string): ApprovalRule | null {
    const row = this.db.prepare('SELECT * FROM approval_rules WHERE id = ?').get(id) as
      | ApprovalRuleRow
      | undefined;
    return row ? rowToRule(row) : null;
  }

  getByPattern(pattern: string): ApprovalRule | null {
    const row = this.db.prepare('SELECT * FROM approval_rules WHERE pattern = ?').get(pattern) as
      | ApprovalRuleRow
      | undefined;
    return row ? rowToRule(row) : null;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM approval_rules').get() as { c: number };
    return row.c;
  }

  /**
   * Insert a rule. Throws on UNIQUE conflict (caller is expected to have
   * checked or to handle the error).
   */
  create(input: CreateApprovalRuleInput): ApprovalRule {
    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO approval_rules (id, pattern, source, notes)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, input.pattern, input.source, input.notes ?? null);
    const created = this.get(id);
    if (!created) throw new Error(`failed to read back approval_rule ${id}`);
    return created;
  }

  /**
   * Insert if not present (no-op on UNIQUE conflict). Returns the existing
   * row if conflict; otherwise the new row. Used by the auto-rule cascade
   * (connector_create handler) where multiple installations may converge on
   * the same generic pattern.
   */
  upsert(input: CreateApprovalRuleInput): ApprovalRule {
    const existing = this.getByPattern(input.pattern);
    if (existing) return existing;
    return this.create(input);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM approval_rules WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Bulk delete by pattern prefix or LIKE. Used for auto-cascade on
   * installation removal: the worker handler computes the slug-derived
   * prefix and calls this with `'mcp__github-app-<slug>__%'`.
   *
   * Only deletes `source='auto'` rules — manual + yaml-migrated rules
   * survive. Returns the number of rows deleted.
   */
  deleteAutoMatching(likePattern: string): number {
    const result = this.db
      .prepare(`DELETE FROM approval_rules WHERE source = 'auto' AND pattern LIKE ?`)
      .run(likePattern);
    return Number(result.changes);
  }
}
