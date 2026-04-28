import type { DB } from '../db.js';
import type { AgentCapability, AgentCapabilityUpdate } from '../types.js';

interface CapabilityRow {
  tool_name: string;
  enabled: number;
  updated_at: string;
}

function rowToCapability(row: CapabilityRow): AgentCapability {
  return {
    toolName: row.tool_name,
    enabled: row.enabled === 1,
    updatedAt: row.updated_at,
  };
}

/**
 * Spec 0052: global non-MCP tool toggles. Operator opts into Read/Edit/
 * Write/Bash/etc. via /settings → Agent capabilities. Gate consults
 * `isEnabled(toolName)` before allowing non-MCP tool calls.
 *
 * The seeds are immutable (managed by migration 11) — methods only UPDATE
 * existing rows. A tool name that isn't in the seed list cannot be
 * "enabled"; it'll throw on `setEnabled`. New tools added by future SDK
 * versions need a new migration to seed; gate denies them safely until
 * that lands.
 */
export class AgentCapabilityRepo {
  constructor(private readonly db: DB) {}

  list(): AgentCapability[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_capabilities ORDER BY tool_name ASC')
      .all() as CapabilityRow[];
    return rows.map(rowToCapability);
  }

  /**
   * Returns false if the tool isn't in the seed list (safe-by-default).
   * Used by the gate on every non-MCP tool call — should be cheap.
   */
  isEnabled(toolName: string): boolean {
    const row = this.db
      .prepare('SELECT enabled FROM agent_capabilities WHERE tool_name = ?')
      .get(toolName) as { enabled: number } | undefined;
    return row?.enabled === 1;
  }

  /**
   * Update a single capability. Throws if the tool isn't in the seed list.
   */
  setEnabled(toolName: string, enabled: boolean): void {
    const result = this.db
      .prepare(
        `UPDATE agent_capabilities
         SET enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE tool_name = ?`,
      )
      .run(enabled ? 1 : 0, toolName);
    if (result.changes === 0) {
      throw new Error(
        `unknown tool '${toolName}' — not in agent_capabilities seed list. Add a migration to seed it.`,
      );
    }
  }

  /**
   * Atomic batch update. Used by the settings page when multiple toggles
   * change in a single PATCH. Throws (and rolls back) if any tool name is
   * not in the seed list.
   */
  setMany(updates: AgentCapabilityUpdate[]): void {
    const txn = this.db.transaction((batch: AgentCapabilityUpdate[]) => {
      for (const u of batch) {
        this.setEnabled(u.toolName, u.enabled);
      }
    });
    txn(updates);
  }
}
