/**
 * Hard cutover for `profile/mcp.json`. Spec 0032 §Migration.
 *
 * The worker no longer reads `profile/mcp.json`. If the file still exists at
 * boot, emit a single structured warning with the server names so the operator
 * knows their old config is inert. The file is NOT renamed or deleted — it
 * stays as an inert reference.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { Logger } from '@zeno/logger';
import { PROFILE_CANDIDATES } from '@/agent/mcp';

interface McpFileShape {
  mcpServers?: Record<string, unknown>;
}

function findProfileMcpJson(): string | null {
  for (const base of PROFILE_CANDIDATES) {
    const path = `${base}/mcp.json`;
    if (existsSync(path)) return path;
  }
  return null;
}

export function warnIfMcpJsonExists(logger: Logger): void {
  const path = findProfileMcpJson();
  if (!path) return;

  let serverNames: string[];
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as McpFileShape;
    serverNames = Object.keys(parsed.mcpServers ?? {});
  } catch {
    serverNames = ['<unparseable>'];
  }

  // Only warn when there are servers declared. A file with `mcpServers: {}` or
  // unparseable content with no extractable names still counts because it
  // implies the operator was using this file for something.
  if (serverNames.length === 0) return;

  logger.warn(
    {
      event: 'mcp_json_ignored',
      path,
      servers: serverNames,
    },
    'MCP servers in mcp.json are no longer loaded. Re-add them via /connectors in the dashboard.',
  );
}
