import type { DB } from '../db.js';
import type {
  ApprovalDecision,
  ApprovalsLogEntry,
  CreateApprovalsLogEntry,
  PolicyThatGated,
} from '../types.js';

interface ApprovalsLogRow {
  id: number;
  profile: string;
  correlation_id: string;
  thread_id: string | null;
  requester_user_id: string;
  decider_user_id: string | null;
  tool_name: string;
  tool_input: string;
  policy_that_gated: string;
  classifier_reason: string | null;
  decision: string;
  decision_reason: string;
  created_at: string;
}

function rowToEntry(row: ApprovalsLogRow): ApprovalsLogEntry {
  return {
    id: row.id,
    profile: row.profile,
    correlationId: row.correlation_id,
    threadId: row.thread_id,
    requesterUserId: row.requester_user_id,
    deciderUserId: row.decider_user_id,
    toolName: row.tool_name,
    toolInput: row.tool_input,
    policyThatGated: row.policy_that_gated as PolicyThatGated,
    classifierReason: row.classifier_reason,
    decision: row.decision as ApprovalDecision,
    decisionReason: row.decision_reason,
    createdAt: row.created_at,
  };
}

export class ApprovalsLogRepo {
  constructor(private readonly db: DB) {}

  insert(entry: CreateApprovalsLogEntry): void {
    this.db
      .prepare(
        `INSERT INTO approvals_log
          (profile, correlation_id, thread_id, requester_user_id, decider_user_id,
           tool_name, tool_input, policy_that_gated, classifier_reason,
           decision, decision_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.profile,
        entry.correlationId,
        entry.threadId,
        entry.requesterUserId,
        entry.deciderUserId,
        entry.toolName,
        entry.toolInput,
        entry.policyThatGated,
        entry.classifierReason,
        entry.decision,
        entry.decisionReason,
      );
  }

  listByCorrelation(correlationId: string): ApprovalsLogEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM approvals_log WHERE correlation_id = ? ORDER BY id ASC')
      .all(correlationId) as ApprovalsLogRow[];
    return rows.map(rowToEntry);
  }
}
