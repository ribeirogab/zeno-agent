import type { CommandRepo } from '@zeno/db/runtime';
import { Hono } from 'hono';

export function buildCommandsRoute(deps: { commands: CommandRepo }): Hono {
  const route = new Hono();
  route.get('/:correlationId', (c) => {
    const id = c.req.param('correlationId');
    const cmd = deps.commands.findByCorrelationId(id);
    if (!cmd) return c.json({ error: 'not_found' }, 404);
    return c.json({
      correlationId: cmd.correlationId,
      type: cmd.type,
      status: cmd.status,
      createdAt: cmd.createdAt,
      processedAt: cmd.processedAt,
      completedAt: cmd.completedAt,
      result: cmd.result,
    });
  });
  return route;
}
