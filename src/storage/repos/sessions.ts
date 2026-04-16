import type { DB } from '@/storage/db';
import type { Session } from '@/storage/types';

interface SessionRow {
  thread_id: string;
  session_id: string;
  created_at: string;
  last_used_at: string;
}

function rowToSession(row: SessionRow): Session {
  return {
    threadId: row.thread_id,
    sessionId: row.session_id,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export class SessionRepo {
  constructor(private readonly db: DB) {}

  upsert(threadId: string, sessionId: string): void {
    this.db
      .prepare(
        `INSERT INTO sessions (thread_id, session_id, created_at, last_used_at)
         VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(thread_id) DO UPDATE SET
           session_id = excluded.session_id,
           last_used_at = CURRENT_TIMESTAMP`,
      )
      .run(threadId, sessionId);
  }

  get(threadId: string): string | null {
    const row = this.db
      .prepare('SELECT session_id FROM sessions WHERE thread_id = ?')
      .get(threadId) as { session_id: string } | undefined;
    return row?.session_id ?? null;
  }

  delete(threadId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE thread_id = ?').run(threadId);
  }

  touch(threadId: string): void {
    this.db
      .prepare('UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE thread_id = ?')
      .run(threadId);
  }

  list(): Session[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY last_used_at DESC')
      .all() as SessionRow[];
    return rows.map(rowToSession);
  }
}
