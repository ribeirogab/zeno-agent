/**
 * Connector ↔ skill M:N link API. Spec 0052 Phase C.1.
 *
 * Mounted as a sub-route under /api/connectors/:id/skills (the parent path
 * /api/connectors is in `connectors.ts`). The dashboard "Linked skills"
 * section on the connector detail page (Paper artboard C-skill-1) reads
 * via GET and writes via PATCH (replace-all semantics).
 */

import { zValidator } from '@hono/zod-validator';
import type { ConnectorRepo, ConnectorSkillRepo } from '@zeno/storage';
import { Hono } from 'hono';
import { z } from 'zod';

export interface ConnectorSkillsRouteDeps {
  connectors: ConnectorRepo;
  connectorSkills: ConnectorSkillRepo;
}

const replaceBody = z.object({
  skillIds: z.array(z.string()),
});

export function buildConnectorSkillsRoute(deps: ConnectorSkillsRouteDeps): Hono {
  const route = new Hono();

  route.get('/:id/skills', (c) => {
    const id = c.req.param('id');
    const connector = deps.connectors.get(id);
    if (!connector) return c.json({ error: 'connector_not_found' }, 404);
    const linked = deps.connectorSkills.listForConnector(id).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      updatedAt: s.updatedAt,
    }));
    return c.json(linked);
  });

  route.patch('/:id/skills', zValidator('json', replaceBody), (c) => {
    const id = c.req.param('id');
    const connector = deps.connectors.get(id);
    if (!connector) return c.json({ error: 'connector_not_found' }, 404);
    const { skillIds } = c.req.valid('json');
    deps.connectorSkills.replaceForConnector(id, skillIds);
    return c.body(null, 204);
  });

  return route;
}
