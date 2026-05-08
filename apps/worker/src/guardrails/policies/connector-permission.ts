/**
 * Per-tool permission gate — the single guardrail surviving spec 0050,
 * extended in spec 0052 with global agent capability toggles for
 * non-MCP tools.
 *
 * Decision tree (deterministic, every input maps to allow|deny):
 *
 *   - tool name does NOT match `mcp__<slug>__<bareTool>` (i.e., a built-in
 *     SDK tool like Bash/Read/Edit/Write/Glob/Grep/WebFetch/WebSearch/Task)
 *     → consult `AgentCapabilityRepo.isEnabled(toolName)`:
 *       - enabled → ALLOW (`agent_capability_allow`)
 *       - disabled (or unknown) → DENY (`agent_capability_deny`)
 *     (Spec 0052: capabilities are global — operator opts in per-tool via
 *     /settings. Skills don't grant individual tools; they're content-only
 *     playbooks that the agent reads when relevant.)
 *
 *   - tool name matches `mcp__<slug>__<bareTool>` AND `slug` is NOT in the
 *     connector_repo → ALLOW
 *     (built-in MCPs from `agent/mcp.json` like `playwright` ride this slot.
 *      They're operator-committed in the repo, distinct from DB-managed
 *      catalog connectors.)
 *
 *   - tool matches AND slug is in connector_repo AND tool entry has
 *     `permission='never'` → DENY
 *
 *   - tool matches AND slug is in connector_repo AND tool entry has
 *     `permission='always_allow'` → ALLOW
 *
 *   - tool matches AND slug is in connector_repo AND tool entry has
 *     `permission='ask'` → ALLOW
 *     (rationale per spec 0050: in the connectors-only model, "installing
 *      the connector with this permission setting" is the operator's
 *      pre-approval. If they want hard-block they set 'never'. The 'ask'
 *      value is preserved in the schema for compatibility with existing
 *      connector_tools rows; a future spec may rename or remove the third
 *      state.)
 *
 *   - tool matches AND slug is in connector_repo AND tool is NOT registered
 *     with the connector → DENY
 */

import type { AgentCapabilityRepo, ConnectorRepo } from '@zeno/db/runtime';
import type { Decision } from '@/guardrails/types';

const TOOL_NAME_REGEX = /^mcp__([a-z0-9][a-z0-9-]*)__(.+)$/;

export function checkConnectorPermission(
  connectorRepo: ConnectorRepo,
  agentCapabilityRepo: AgentCapabilityRepo,
  toolName: string,
): Decision {
  const match = toolName.match(TOOL_NAME_REGEX);
  if (!match) {
    // Spec 0052: consult global agent capabilities. Operator opts in per-tool
    // via /settings. Disabled tools (or tools not in the seed list) deny safely.
    if (agentCapabilityRepo.isEnabled(toolName)) {
      return {
        allow: true,
        reason: `non-MCP tool '${toolName}' enabled in agent_capabilities`,
        policyThatGated: 'agent_capability_allow',
      };
    }
    return {
      allow: false,
      reason: `non-MCP tool '${toolName}' is disabled — enable it in /settings/agent-capabilities or use only connector tools`,
      policyThatGated: 'agent_capability_deny',
    };
  }
  const slug = match[1];
  const bareTool = match[2];
  if (!slug || !bareTool) {
    return {
      allow: false,
      reason: `malformed MCP tool name '${toolName}'`,
      policyThatGated: 'non_mcp_deny',
    };
  }

  const connector = connectorRepo.getBySlug(slug);
  if (!connector) {
    return {
      allow: true,
      reason: `built-in MCP '${slug}' (not in connector_repo)`,
      policyThatGated: 'builtin_mcp_allow',
    };
  }

  const tools = connectorRepo.getTools(connector.id);
  const entry = tools.find((t) => t.toolName === bareTool);
  if (!entry) {
    return {
      allow: false,
      reason: `tool '${bareTool}' not registered with connector '${slug}'`,
      policyThatGated: 'unknown_tool_deny',
    };
  }

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
  // 'ask' is treated as allow (operator's installation-time decision is the
  // approval). The third state is kept for schema compat with existing rows.
  return {
    allow: true,
    reason: `connector ${slug} permission=ask treated as allow (spec 0050)`,
    policyThatGated: 'connector_ask_allow',
  };
}
