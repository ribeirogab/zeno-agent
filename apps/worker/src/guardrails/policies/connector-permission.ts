/**
 * Per-tool 3-state permission policy for DB-managed connectors. Spec 0032.
 *
 * Resolution rules (returns `undefined` to fall through to the next policy):
 *   - tool name does not match `mcp__<slug>__<tool>` → undefined
 *   - slug not found in DB → undefined (built-in MCPs ride this slot)
 *   - tool name not in connector's permissions → undefined (unknown → ask)
 *   - permission='always_allow' → allow (policyThatGated='connector_allow')
 *   - permission='never' → deny (policyThatGated='connector_never')
 *   - permission='ask' → undefined (let classifier handle it)
 */

import type { ConnectorRepo } from '@zeno/storage';
import type { PolicyMiddleware } from '../types.js';

const TOOL_NAME_REGEX = /^mcp__([a-z0-9][a-z0-9-]*)__(.+)$/;

interface Deps {
  connectorRepo: ConnectorRepo;
}

export function makeConnectorPermissionPolicy(deps: Deps): PolicyMiddleware {
  return {
    name: 'connector_permission',
    async check(ctx) {
      const match = ctx.toolName.match(TOOL_NAME_REGEX);
      if (!match) return undefined;
      const slug = match[1];
      const bareTool = match[2];
      if (!slug || !bareTool) return undefined;

      const connector = deps.connectorRepo.getBySlug(slug);
      if (!connector) return undefined;

      const tools = deps.connectorRepo.getTools(connector.id);
      const entry = tools.find((t) => t.toolName === bareTool);
      if (!entry) return undefined;

      if (entry.permission === 'always_allow') {
        return {
          allow: true,
          reason: `connector ${slug} permission=always_allow for ${bareTool}`,
          policyThatGated: 'connector_allow',
        };
      }
      if (entry.permission === 'never') {
        return {
          allow: false,
          reason: `connector ${slug} permission=never for ${bareTool}`,
          policyThatGated: 'connector_never',
        };
      }
      // 'ask' falls through
      return undefined;
    },
  };
}
