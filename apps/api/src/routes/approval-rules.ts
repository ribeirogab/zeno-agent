/**
 * Approval Rules API. Spec 0047.
 *
 * Endpoints:
 *   GET    /         — list all rules
 *   POST   /         — add a manual rule (validates pattern + uniqueness)
 *   DELETE /:id      — remove a rule (rejects auto-managed rules with 403)
 *   POST   /preview  — match preview against current installed tool inventory
 */

import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import type { ApprovalRulesRepo, ConnectorRepo } from '@zeno/storage';
import { Hono } from 'hono';
import { z } from 'zod';

// Spec 0047 §Risks + spec 0048 Q7: pattern validation. The shape mirrors
// actual tool names (mcp__<connector>__<tool>) plus optional `*` wildcards
// at any position. Min 1 char, max 200 to bound regex compile cost. The
// 0048 relaxation allows the first segment to be empty so patterns like
// `*delete*` (matching anything containing 'delete') work cleanly.
const PATTERN_REGEX = /^[\w*-]*(__[\w*-]+)*$/;

const createSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .max(200)
    .regex(
      PATTERN_REGEX,
      'pattern must follow tool name shape (mcp__connector__tool, * wildcards allowed)',
    ),
  notes: z.string().max(500).optional(),
});

const previewSchema = z.object({
  pattern: z.string().min(1).max(200),
});

export interface ApprovalRulesRouteDeps {
  rules: ApprovalRulesRepo;
  /** Used by the preview endpoint to evaluate the pattern against installed tools. */
  connectors: ConnectorRepo;
}

const REGEX_META = /[.*+?^${}()|[\]\\]/g;
function escapeRegExp(s: string): string {
  return s.replace(REGEX_META, '\\$&');
}

function matchGlob(pattern: string, toolName: string): boolean {
  if (!pattern.includes('*')) return pattern === toolName;
  const regex = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
  return regex.test(toolName);
}

/**
 * Build the full tool inventory from installed connectors. Each tool name
 * is in the SDK shape `mcp__<slug>__<tool>` so the preview matches what the
 * runtime will actually evaluate against.
 */
function buildToolInventory(connectors: ConnectorRepo): string[] {
  const out: string[] = [];
  for (const c of connectors.list()) {
    if (c.status !== 'enabled') continue;
    for (const t of connectors.getTools(c.id)) {
      out.push(`mcp__${c.slug}__${t.toolName}`);
    }
  }
  return out;
}

export function buildApprovalRulesRoute(deps: ApprovalRulesRouteDeps): Hono {
  const route = new Hono();

  route.get('/', (c) => {
    // Spec 0048 Q6: ?include=match-status returns each rule with a
    // matchStatus block (matchCount + isOrphan) so the dashboard can render
    // the orphan-warning UI without a second round-trip.
    const include = c.req.query('include');
    if (include === 'match-status') {
      const inventory = buildToolInventory(deps.connectors);
      const enriched = deps.rules.list().map((rule) => {
        const matchCount = inventory.filter((t) => matchGlob(rule.pattern, t)).length;
        return {
          ...rule,
          matchStatus: {
            matchCount,
            // Auto rules are exempt from orphan classification — they're
            // managed by installation lifecycle, so a 0-match auto rule
            // means the worker hasn't synced yet, not that the operator
            // forgot to clean up.
            isOrphan: matchCount === 0 && rule.source !== 'auto',
          },
        };
      });
      return c.json(enriched);
    }
    return c.json(deps.rules.list());
  });

  // Spec 0048 Q6: mass-remove orphan rules (manual + yaml-migrated only).
  // Body `{confirm: true}` required — defensive against accidental DELETE.
  route.post('/remove-orphans', zValidator('json', z.object({ confirm: z.literal(true) })), (c) => {
    const inventory = buildToolInventory(deps.connectors);
    const toRemove = deps.rules.list().filter((rule) => {
      if (rule.source === 'auto') return false;
      return inventory.every((t) => !matchGlob(rule.pattern, t));
    });
    let removed = 0;
    for (const rule of toRemove) {
      if (deps.rules.delete(rule.id)) removed += 1;
    }
    return c.json({ deletedCount: removed });
  });

  route.post('/', zValidator('json', createSchema), (c) => {
    const body = c.req.valid('json');
    const existing = deps.rules.getByPattern(body.pattern);
    if (existing) {
      return c.json({ error: 'pattern_already_exists', existingId: existing.id }, 409);
    }
    const created = deps.rules.create({
      id: randomUUID(),
      pattern: body.pattern,
      source: 'manual',
      notes: body.notes ?? null,
    });
    return c.json(created, 201);
  });

  route.delete('/:id', (c) => {
    const id = c.req.param('id');
    const rule = deps.rules.get(id);
    if (!rule) return c.json({ error: 'not_found' }, 404);
    // Spec 0047 §API: reject auto-managed rules with 403 Forbidden.
    if (rule.source === 'auto') {
      return c.json(
        {
          error: 'auto_managed_rule',
          detail:
            'this rule is system-managed and removed automatically when the related connector is uninstalled',
        },
        403,
      );
    }
    deps.rules.delete(id);
    return c.json({ ok: true });
  });

  route.post('/preview', zValidator('json', previewSchema), (c) => {
    const { pattern } = c.req.valid('json');
    const inventory = buildToolInventory(deps.connectors);
    const matches = inventory.filter((t) => matchGlob(pattern, t));
    return c.json({
      matchCount: matches.length,
      samples: matches.slice(0, 10),
      totalInventory: inventory.length,
    });
  });

  return route;
}
