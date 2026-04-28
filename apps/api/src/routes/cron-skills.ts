/**
 * Cron ↔ skill M:N link API. Spec 0054.
 *
 * Mounted as a sub-route under /api/crons/:id/skills (the parent path
 * /api/crons is in `crons.ts`). The dashboard "Linked skills" section on
 * the cron detail page reads via GET and writes via PATCH (replace-all
 * semantics, mirroring `connector-skills.ts`).
 */

import { zValidator } from '@hono/zod-validator';
import type { CronRepo, CronSkillRepo } from '@zeno/storage';
import { Hono } from 'hono';
import { z } from 'zod';

export interface CronSkillsRouteDeps {
  crons: CronRepo;
  cronSkills: CronSkillRepo;
}

const replaceBody = z.object({
  skillIds: z.array(z.string()),
});

export function buildCronSkillsRoute(deps: CronSkillsRouteDeps): Hono {
  const route = new Hono();

  route.get('/:id/skills', (c) => {
    const id = c.req.param('id');
    const cron = deps.crons.get(id);
    if (!cron) return c.json({ error: 'cron_not_found' }, 404);
    const linked = deps.cronSkills.listForCron(id).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      updatedAt: s.updatedAt,
    }));
    return c.json(linked);
  });

  route.patch('/:id/skills', zValidator('json', replaceBody), (c) => {
    const id = c.req.param('id');
    const cron = deps.crons.get(id);
    if (!cron) return c.json({ error: 'cron_not_found' }, 404);
    const { skillIds } = c.req.valid('json');
    deps.cronSkills.replaceForCron(id, skillIds);
    return c.body(null, 204);
  });

  return route;
}
