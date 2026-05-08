import { asc, eq, sql } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { agentCapabilities } from '../schema.js';

export interface AgentCapability {
  toolName: string;
  enabled: boolean;
  updatedAt: string;
}

export interface AgentCapabilityUpdate {
  toolName: string;
  enabled: boolean;
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
  constructor(private readonly db: RuntimeDB) {}

  list(): AgentCapability[] {
    const rows = this.db
      .select()
      .from(agentCapabilities)
      .orderBy(asc(agentCapabilities.toolName))
      .all();
    return rows.map((row) => ({
      toolName: row.toolName,
      enabled: row.enabled === 1,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Returns false if the tool isn't in the seed list (safe-by-default).
   * Used by the gate on every non-MCP tool call — should be cheap.
   */
  isEnabled(toolName: string): boolean {
    const row = this.db
      .select({ enabled: agentCapabilities.enabled })
      .from(agentCapabilities)
      .where(eq(agentCapabilities.toolName, toolName))
      .get();
    return row?.enabled === 1;
  }

  /**
   * Update a single capability. Throws if the tool isn't in the seed list.
   */
  setEnabled(toolName: string, enabled: boolean): void {
    const result = this.db
      .update(agentCapabilities)
      .set({
        enabled: enabled ? 1 : 0,
        updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      })
      .where(eq(agentCapabilities.toolName, toolName))
      .run();
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
    this.db.transaction((tx) => {
      for (const u of updates) {
        const result = tx
          .update(agentCapabilities)
          .set({
            enabled: u.enabled ? 1 : 0,
            updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
          })
          .where(eq(agentCapabilities.toolName, u.toolName))
          .run();
        if (result.changes === 0) {
          throw new Error(
            `unknown tool '${u.toolName}' — not in agent_capabilities seed list. Add a migration to seed it.`,
          );
        }
      }
    });
  }
}
