/**
 * Agent capabilities REST API. Spec 0052 Phase C.1.
 *
 * Endpoints:
 *   - GET /api/agent-capabilities          — list of all seeded tools + state
 *   - PATCH /api/agent-capabilities        — batch toggle (atomic)
 *
 * Backed by `AgentCapabilityRepo` (tool list immutable; only `enabled`
 * mutates). Toggling an unknown tool returns 400 with the specific error
 * surfaced from the repo.
 *
 * The connector-permission gate (apps/worker/src/guardrails/policies/
 * connector-permission.ts) consults this repo on every non-MCP tool call.
 * Default state is all-disabled — operator opts in via the dashboard
 * /settings page (Paper artboard SET1).
 */

import { zValidator } from '@hono/zod-validator';
import type { AgentCapabilityRepo } from '@zeno/storage';
import { Hono } from 'hono';
import { z } from 'zod';

export interface AgentCapabilitiesRouteDeps {
  agentCapabilities: AgentCapabilityRepo;
}

const updateBody = z.object({
  updates: z
    .array(
      z.object({
        toolName: z.string().min(1),
        enabled: z.boolean(),
      }),
    )
    .min(1),
});

export function buildAgentCapabilitiesRoute(deps: AgentCapabilitiesRouteDeps): Hono {
  const route = new Hono();

  route.get('/', (c) => {
    return c.json(deps.agentCapabilities.list());
  });

  route.patch('/', zValidator('json', updateBody), (c) => {
    const { updates } = c.req.valid('json');
    try {
      deps.agentCapabilities.setMany(updates);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: 'unknown_tool', message: msg }, 400);
    }
    return c.json(deps.agentCapabilities.list());
  });

  return route;
}
