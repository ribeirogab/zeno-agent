import { zValidator } from '@hono/zod-validator';
import type { SessionRepo } from '@zeno/storage';
import { Hono } from 'hono';
import { z } from 'zod';
import { readSessionMessages } from '@/lib/read-session-jsonl';

export interface SessionsRouteDeps {
  sessions: SessionRepo;
  claudeHome: string;
}

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function buildSessionsRoute(deps: SessionsRouteDeps): Hono {
  const route = new Hono();

  route.get('/', zValidator('query', listQuery), (c) => {
    const { limit } = c.req.valid('query');
    // SessionRepo.list already orders by last_used_at DESC
    const all = deps.sessions.list();
    return c.json(all.slice(0, limit));
  });

  route.get('/:threadId', (c) => {
    const threadId = c.req.param('threadId');
    const all = deps.sessions.list();
    const session = all.find((s) => s.threadId === threadId);
    if (!session) return c.json({ error: 'not_found' }, 404);
    const messages = readSessionMessages(deps.claudeHome, session.sessionId);
    return c.json({ session, messages });
  });

  return route;
}
